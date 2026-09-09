import { randomUUID } from "node:crypto";
import { type JSONValue } from "postgres";
import { audit, systemTransaction, type Tx } from "./db";
import {
  collectStep,
  collectionSteps,
  collectAuditEvents,
  type AuditCorrelation,
} from "./collector";
import { context, insertRecord, linked, paid, type RecordRow } from "./records";
import { decrypt, encrypt, hashToken } from "./crypto";
import {
  type Snapshot,
  type Standard,
  standardSchema,
  monthsAfter,
} from "./domain";
import { diffSnapshots, evaluate } from "./analysis";
import { appOrigin, sendEmail } from "./email";
import { deliverWebhook, nextSchedule } from "./delivery";
import { generateReport } from "./reports";
import { reconcileBilling } from "./billing";
type Job = {
  id: string;
  workspace_id: string;
  customer_id: string;
  kind: string;
  payload: Record<string, any>;
  attempts: number;
  lease_token: string;
};
async function queue(
  sql: Tx,
  workspace: string,
  customer: string,
  kind: string,
  key: string,
  payload: Record<string, unknown>,
) {
  await sql`insert into enterprise.jobs(workspace_id,customer_id,kind,dedupe_key,payload) values(${workspace},${customer},${kind},${key},${sql.json(payload as JSONValue)}) on conflict(dedupe_key) do nothing`;
}
export async function scheduleJobs() {
  await systemTransaction(async (sql) => {
    const [lock] =
      await sql`select pg_try_advisory_xact_lock(18373004) as acquired`;
    if (!lock?.acquired) return;
    const tenants =
      await sql`select t.* from enterprise.tenants t join enterprise.subscriptions s on s.workspace_id=t.workspace_id where t.status='connected' and t.next_collection_at<=now() and ((s.status='active' and s.paid_through>now()) or (s.status='trialing' and s.trial_ends_at>now())) for update of t skip locked limit 30`;
    for (const tenant of tenants) {
      const active =
        await sql`select id from enterprise.jobs where customer_id=${tenant.id} and kind='collect' and status in ('queued','running') limit 1`;
      if (active.length) continue;
      const snapshot: Snapshot = {
        version: 1,
        capturedAt: new Date().toISOString(),
        sections: {},
      };
      const row = await insertRecord(
        sql,
        tenant.workspace_id as string,
        tenant.id as string,
        "snapshot",
        `Collection ${snapshot.capturedAt}`,
        { step: 0, totalSteps: collectionSteps.length },
        null,
        snapshot,
        "collecting",
        monthsAfter(new Date(), 12).toISOString(),
      );
      await queue(
        sql,
        tenant.workspace_id as string,
        tenant.id as string,
        "collect",
        `collect:${row.id}`,
        { snapshotId: row.id, step: 0 },
      );
      await sql`update enterprise.tenants set next_collection_at=now()+interval '1 day' where id=${tenant.id}`;
    }
    const schedules = await sql<
      RecordRow[]
    >`select r.* from enterprise.records r join enterprise.subscriptions s on s.workspace_id=r.workspace_id where r.kind='schedule' and r.status='active' and r.data->>'enabled'='true' and (r.data->>'nextRun')::timestamptz<=now() and ((s.status='active' and s.paid_through>now()) or (s.status='trialing' and s.trial_ends_at>now())) for update of r skip locked limit 30`;
    for (const schedule of schedules) {
      const [snapshot] = await sql<
        RecordRow[]
      >`select * from enterprise.records where workspace_id=${schedule.workspace_id} and customer_id=${schedule.customer_id} and kind='snapshot' and status in ('complete','partial') order by created_at desc limit 1`;
      if (!snapshot) continue;
      await queue(
        sql,
        schedule.workspace_id,
        schedule.customer_id!,
        "report",
        `schedule:${schedule.id}:${String(schedule.data.nextRun)}`,
        { ...schedule.data, snapshotId: snapshot.id, scheduleId: schedule.id },
      );
      const next = nextSchedule(
        new Date(),
        schedule.data.cadence as string,
        schedule.data.hour as number,
        schedule.data.timezone as string,
      );
      await sql`update enterprise.records set data=jsonb_set(data,'{nextRun}',to_jsonb(${next.toISOString()}::text)),updated_at=now() where id=${schedule.id}`;
    }
    await sql`update enterprise.records set status='expired' where kind='exception' and status in ('pending','approved') and expires_at<=now()`;
    await sql`delete from enterprise.records where expires_at<=now() and kind in ('snapshot','report','finding','consent','api_key')`;
    await sql`update enterprise.records b set status='expired' where b.kind='baseline' and b.status='approved' and not exists(select 1 from enterprise.records s where s.id::text=b.data->>'snapshotId' and s.kind='snapshot')`;
    await sql`delete from enterprise.jobs where completed_at<now()-interval '30 days'`;
    await sql`delete from enterprise.records r using enterprise.subscriptions s where r.workspace_id=s.workspace_id and s.provider_id is not null and s.status not in ('active','trialing') and coalesce(s.paid_through,s.trial_ends_at)<now()-interval '30 days'`;
    await sql`delete from enterprise.rate_limits where resets_at<now()`;
    await sql`update enterprise.jobs set status='failed',error='Worker retry limit reached. Retry the collection from the workspace.' where status='running' and lease_until<now() and attempts>=5`;
  });
}
async function notify(sql: Tx, job: Job, event: string, recordId: string) {
  const routes = await sql<
    RecordRow[]
  >`select * from enterprise.records where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='alert_route' and status='active'`;
  for (const route of routes)
    if ((route.data.events as string[]).includes(event))
      await queue(
        sql,
        job.workspace_id,
        job.customer_id,
        "email",
        `${event}:${recordId}:${route.id}`,
        {
          routeId: route.id,
          recipients: route.data.recipients,
          subject:
            event === "drift.detected"
              ? "Configuration changes need your review"
              : "Configuration collection completed",
          text: `Review the customer workspace: ${appOrigin()}/enterprise?workspace=${job.workspace_id}&customer=${job.customer_id}&view=drift\n\nNo configuration data is included in this email. Sign-in and current customer access are required.`,
        },
      );
  const webhooks = await sql<
    RecordRow[]
  >`select * from enterprise.records where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='webhook' and status='active'`;
  for (const webhook of webhooks)
    if ((webhook.data.events as string[]).includes(event))
      await queue(
        sql,
        job.workspace_id,
        job.customer_id,
        "webhook",
        `${event}:${recordId}:${webhook.id}`,
        { webhookId: webhook.id, event, recordId },
      );
}
async function analyze(
  sql: Tx,
  job: Job,
  row: RecordRow,
  snapshot: Snapshot,
  correlation: { events: AuditCorrelation[]; complete: boolean },
) {
  const windows = await sql<
    RecordRow[]
  >`select * from enterprise.records where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='maintenance' and status='active'`;
  const [baseline] = await sql<
    RecordRow[]
  >`select * from enterprise.records where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='baseline' and status='approved' order by created_at desc limit 1`;
  const [previous] = await sql<
    RecordRow[]
  >`select * from enterprise.records where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='snapshot' and id<>${row.id} and status='complete' order by created_at desc limit 1`;
  const base = baseline
    ? await linked(
        sql,
        job.workspace_id,
        job.customer_id,
        baseline.data.snapshotId as string,
        "snapshot",
      )
    : previous;
  const comparison = base
    ? diffSnapshots(decrypt<Snapshot>(base.encrypted!, context(base)), snapshot)
    : { changes: [], skipped: [] };
  const results: Array<{
    key: string;
    name: string;
    severity: string;
    content: unknown;
    type: string;
  }> = [];
  for (const change of comparison.changes)
    results.push({
      key: hashToken(
        JSON.stringify([
          "drift",
          baseline?.id ?? base?.id,
          change.section,
          change.policy,
          change.path,
          change.after,
        ]),
      ),
      name: `${change.name}: ${change.kind} ${change.path}`,
      severity: "medium",
      content: {
        ...change,
        auditCorrelation: {
          complete: correlation.complete,
          candidates: correlation.events
            .filter((event) =>
              event.resources?.some(
                (resource) => resource.resourceId === change.policy,
              ),
            )
            .map((event) => ({
              ...event,
              maintenanceWindow:
                windows.find(
                  (window) =>
                    Date.parse(event.activityDateTime) >=
                      Date.parse(window.data.startsAt as string) &&
                    Date.parse(event.activityDateTime) <=
                      Date.parse(window.data.endsAt as string),
                )?.name ?? null,
            })),
          interpretation:
            "Resource ID and time correlation, not proof of causation.",
        },
      },
      type: baseline ? "drift" : "change",
    });
  const standards = await sql<
    RecordRow[]
  >`select * from enterprise.records where workspace_id=${job.workspace_id} and (customer_id=${job.customer_id} or customer_id is null) and kind='standard' and status='active'`;
  const effectiveStandards = standards.filter(
    (standard) =>
      standard.customer_id !== null ||
      !standards.some(
        (override) =>
          override.customer_id === job.customer_id &&
          override.data.templateId === standard.id,
      ),
  );
  for (const standard of effectiveStandards) {
    const definition: Standard = standardSchema.parse(standard.data);
    for (const result of evaluate(snapshot, definition))
      if (result.status !== "pass")
        results.push({
          key: hashToken(
            JSON.stringify([
              "standard",
              standard.id,
              result.rule,
              result.policy,
            ]),
          ),
          name: `${standard.name}: ${definition.rules.find((r) => r.id === result.rule)?.name ?? result.rule}`,
          severity: result.severity,
          content: result,
          type: result.status === "unknown" ? "unknown" : "standard",
        });
  }
  let created = 0;
  for (const result of results) {
    const [existing] =
      await sql`select id from enterprise.records where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='finding' and data->>'fingerprint'=${result.key} and status='open' limit 1`;
    if (existing) continue;
    await insertRecord(
      sql,
      job.workspace_id,
      job.customer_id,
      "finding",
      result.name,
      {
        fingerprint: result.key,
        severity: result.severity,
        type: result.type,
        snapshotId: row.id,
        baselineId: baseline?.id ?? null,
        discoveredAt: new Date().toISOString(),
        actorAttribution: "unavailable",
      },
      null,
      result.content,
      "open",
      monthsAfter(new Date(), 12).toISOString(),
    );
    created++;
  }
  // Never resolve findings based on missing or incomplete collection data.
  if (Object.values(snapshot.sections).every((s) => s.status === "complete")) {
    const fingerprints = results.map((r) => r.key);
    await sql`update enterprise.records set status='resolved',updated_at=now() where workspace_id=${job.workspace_id} and customer_id=${job.customer_id} and kind='finding' and status='open' and data->>'type'<>'change' and not (data->>'fingerprint'=any(${fingerprints}::text[]))`;
  }
  if (created) await notify(sql, job, "drift.detected", row.id);
  await sql`update enterprise.records set data=data||${sql.json({ changes: comparison.changes.length, findings: created, skipped: comparison.skipped, standardVersions: effectiveStandards.map((s) => ({ id: s.id, version: Number(s.data.definitionVersion ?? 1) })) })} where id=${row.id}`;
}
export async function runWorker() {
  if (
    process.env.ENTERPRISE_ENABLED !== "true" ||
    process.env.ENTERPRISE_WORKER_PAUSED === "true"
  )
    return { paused: true };
  await reconcileBilling();
  await scheduleJobs();
  const job = await systemTransaction(async (sql) => {
    const [row] = await sql<
      Job[]
    >`update enterprise.jobs set status='running',lease_until=now()+interval '6 minutes',lease_token=${randomUUID()},attempts=attempts+1 where id=(select id from enterprise.jobs where ((status='queued' and available_at<=now()) or (status='running' and lease_until<now())) and attempts<5 order by available_at for update skip locked limit 1) returning *`;
    return row;
  });
  if (!job) return { idle: true };
  try {
    const source = await systemTransaction(async (sql) => {
      await paid(sql, job.workspace_id);
      const [tenant] =
        await sql`select * from enterprise.tenants where id=${job.customer_id} and workspace_id=${job.workspace_id}`;
      if (!tenant || (job.kind === "collect" && tenant.status !== "connected"))
        throw new Error("Customer collection is disconnected");
      const record =
        job.kind === "collect" || job.kind === "report"
          ? await linked(
              sql,
              job.workspace_id,
              job.customer_id,
              job.payload.snapshotId as string,
              "snapshot",
            )
          : job.kind === "webhook"
            ? await linked(
                sql,
                job.workspace_id,
                job.customer_id,
                job.payload.webhookId as string,
                "webhook",
              )
            : null;
      return { tenant, record };
    });
    let collected: Record<string, any> | undefined,
      report: Awaited<ReturnType<typeof generateReport>> | undefined;
    if (job.kind === "collect")
      collected = await collectStep(
        source.tenant.tenant_id as string,
        job.payload.step as number,
      );
    let correlation: { events: AuditCorrelation[]; complete: boolean } = {
      events: [],
      complete: false,
    };
    if (
      job.kind === "collect" &&
      Number(job.payload.step) === collectionSteps.length - 1
    )
      correlation = await collectAuditEvents(
        source.tenant.tenant_id as string,
        new Date(Date.now() - 7 * 86400000).toISOString(),
      );
    if (job.kind === "report") {
      const summary = await systemTransaction(async (sql) => {
        const counts =
          await sql`select kind,count(*)::int as count from enterprise.records where customer_id=${job.customer_id} and workspace_id=${job.workspace_id} and data->>'snapshotId'=${source.record!.id} and kind in ('review','finding') group by kind`;
        const trend =
          await sql`select created_at,data from enterprise.records where customer_id=${job.customer_id} and kind='snapshot' and status in ('complete','partial') and created_at<=${source.record!.created_at}::timestamptz and created_at>=${source.record!.created_at}::timestamptz-interval '90 days' order by created_at desc limit 90`;
        return {
          findings: Number(
            counts.find((c) => c.kind === "finding")?.count ?? 0,
          ),
          reviews: Number(counts.find((c) => c.kind === "review")?.count ?? 0),
          changes: Number(source.record!.data.changes ?? 0),
          trend: trend.map(
            (t) =>
              `${String(t.created_at)}: ${String(Number((t.data as Record<string, unknown>).changes ?? 0))} changes`,
          ),
        };
      });
      report = await generateReport(
        decrypt<Snapshot>(source.record!.encrypted!, context(source.record!)),
        job.payload.format as "pdf" | "docx",
        job.payload.template as string,
        (source.tenant.branding as Record<string, string>).companyName ??
          (source.tenant.name as string),
        summary,
        (source.tenant.branding as Record<string, string>).primaryColor,
      );
    }
    if (job.kind === "webhook") {
      if (source.record!.status !== "active")
        throw new Error("Webhook revoked");
      const secret = decrypt<{ signingSecret: string }>(
        source.record!.encrypted!,
        context(source.record!),
      );
      await deliverWebhook(
        source.record!.data.url as string,
        secret.signingSecret,
        {
          id: job.id,
          type: job.payload.event,
          workspaceId: job.workspace_id,
          customerId: job.customer_id,
          recordId: job.payload.recordId,
        },
        job.id,
      );
    }
    if (job.kind === "email")
      await sendEmail(
        job.payload.recipients as string[],
        job.payload.subject as string,
        job.payload.text as string,
        job.id,
      );
    await systemTransaction(async (sql) => {
      const lock =
        await sql`select id from enterprise.jobs where id=${job.id} and lease_token=${job.lease_token} and status='running' and lease_until>now() for update`;
      if (!lock.length) return; // Fencing: an expired/replaced worker cannot commit evidence.
      await paid(sql, job.workspace_id);
      if (collected) {
        const snapshot = decrypt<Snapshot>(
          source.record!.encrypted!,
          context(source.record!),
        );
        Object.assign(snapshot.sections, collected);
        const step = Number(job.payload.step) + 1,
          done = step >= collectionSteps.length;
        const status = done
          ? Object.values(snapshot.sections).every(
              (s) => s.status === "complete",
            )
            ? "complete"
            : "partial"
          : "collecting";
        await sql`update enterprise.records set encrypted=${encrypt(snapshot, context(source.record!))},status=${status},data=data||${sql.json({ step, totalSteps: collectionSteps.length })},updated_at=now() where id=${source.record!.id}`;
        if (!done) {
          await sql`update enterprise.jobs set status='queued',available_at=now(),lease_until=null,attempts=0,payload=payload||${sql.json({ step })} where id=${job.id}`;
          return;
        }
        await analyze(sql, job, source.record!, snapshot, correlation);
        await sql`update enterprise.tenants set last_collected_at=now(),health=${status === "complete" ? null : "Some sections could not be read; inspect the collection coverage."} where id=${job.customer_id}`;
        await notify(sql, job, "collection.completed", source.record!.id);
      }
      if (report) {
        const row = await insertRecord(
          sql,
          job.workspace_id,
          job.customer_id,
          "report",
          `${source.tenant.name as string} ${String(job.payload.template)} report`,
          {
            snapshotId: source.record!.id,
            format: job.payload.format,
            template: job.payload.template,
            errors: report.errors,
          },
          null,
          { base64: Buffer.from(report.buffer).toString("base64") },
          "ready",
          monthsAfter(new Date(), 12).toISOString(),
        );
        const recipients = job.payload.recipients as string[] | undefined;
        if (recipients?.length)
          await queue(
            sql,
            job.workspace_id,
            job.customer_id,
            "email",
            `report-email:${row.id}`,
            {
              recipients,
              subject: `Your ${source.tenant.name as string} configuration report is ready`,
              text: `Sign in to your private report library to download the report.\n${appOrigin()}/enterprise?workspace=${job.workspace_id}&customer=${job.customer_id}&view=reports\n\nAccess is limited to invited workspace members.`,
            },
          );
        await notify(sql, job, "report.ready", row.id);
      }
      await sql`update enterprise.jobs set status='complete',completed_at=now(),lease_until=null,error=null where id=${job.id}`;
      await audit(
        sql,
        job.workspace_id,
        null,
        `job.${job.kind}.completed`,
        job.customer_id,
        { jobId: job.id },
      );
    });
    return { processed: job.id };
  } catch {
    await systemTransaction(async (sql) => {
      await sql`update enterprise.jobs set status=${job.attempts >= 5 ? "failed" : "queued"},available_at=now()+${Math.min(3600, 30 * 2 ** job.attempts)}*interval '1 second',lease_until=null,error='The job could not complete. Check connection permissions and service configuration, then retry.' where id=${job.id} and lease_token=${job.lease_token} and status='running'`;
      if (job.kind === "collect" && job.attempts >= 5)
        await sql`update enterprise.records set status='failed',updated_at=now() where id=${job.payload.snapshotId as string} and workspace_id=${job.workspace_id}`;
      if (job.kind === "collect")
        await sql`update enterprise.tenants set health='Collection failed. Check consent and collection history.' where id=${job.customer_id}`;
    });
    return { failed: job.id };
  }
}
export async function requestReport(
  sql: Tx,
  workspace: string,
  customer: string,
  snapshotId: string,
  format: string,
  template: string,
) {
  const snapshot = await linked(
    sql,
    workspace,
    customer,
    snapshotId,
    "snapshot",
  );
  if (!["complete", "partial"].includes(snapshot.status))
    throw new Error("Snapshot has not finished collecting");
  const id = randomUUID();
  await queue(sql, workspace, customer, "report", `manual-report:${id}`, {
    snapshotId,
    format,
    template,
  });
  return { queued: true };
}
