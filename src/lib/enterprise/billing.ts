import { Polar } from "@polar-sh/sdk";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { type Identity } from "./auth";
import { audit, systemTransaction, workspaceTransaction } from "./db";
import {
  EnterpriseError,
  FOUNDERS_END,
  type Plan,
  price,
  monthsAfter,
} from "./domain";
import { appOrigin } from "./email";
import { insertRecord, type RecordRow } from "./records";
export function polar() {
  if (!process.env.POLAR_ACCESS_TOKEN)
    throw new EnterpriseError(
      503,
      "Billing is not configured. Contact support@ugurlabs.com.",
    );
  return new Polar({
    timeoutMs: 10000,
    retryConfig: { strategy: "none" },
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    server:
      process.env.POLAR_ENVIRONMENT === "production" ? "production" : "sandbox",
  });
}
function product(plan: Plan, interval: "month" | "year") {
  const id =
    process.env[
      `POLAR_${plan.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`
    ];
  if (!id)
    throw new EnterpriseError(503, "This billing plan is not configured.");
  return id;
}
// Polar's API calls quantity 'seats'. These units are monitored production/customer
// tenants; no seat benefit is provisioned and human membership is unlimited.
export function catalogPrices(plan: Plan, interval: "month" | "year") {
  const factor = interval === "year" ? 10.2 : 1,
    included = plan === "enterprise" ? 1 : 10;
  return [
    {
      amountType: "fixed" as const,
      priceCurrency: "usd" as const,
      priceAmount: Math.round((plan === "enterprise" ? 14900 : 24900) * factor),
    },
    {
      amountType: "seat_based" as const,
      priceCurrency: "usd" as const,
      seatTiers: {
        seatTierType: "graduated" as const,
        tiers: [
          { minSeats: 1, maxSeats: included, pricePerSeat: 0 },
          {
            minSeats: included + 1,
            maxSeats: null,
            pricePerSeat: Math.round(
              (plan === "enterprise" ? 9900 : 2000) * factor,
            ),
          },
        ],
      },
    },
  ];
}
export async function billingAction(
  identity: Identity,
  workspace: string,
  input: unknown,
) {
  const data = z
    .object({
      action: z.enum(["checkout", "portal", "quantity"]),
      interval: z.enum(["month", "year"]).default("month"),
      quantity: z.number().int().min(1).max(10000).default(1),
      founders: z.boolean().default(false),
      trial: z.boolean().default(true),
    })
    .parse(input);
  return workspaceTransaction(
    identity,
    workspace,
    "billing",
    null,
    async (sql, member) => {
      const [ws] =
        await sql`select * from enterprise.workspaces where id=${workspace} for update`;
      const [sub] =
        await sql`select * from enterprise.subscriptions where workspace_id=${workspace}`;
      const plan = ws!.plan as Plan;
      if (data.action === "portal") {
        const session = await polar().customerSessions.create({
          externalCustomerId: workspace,
          returnUrl: `${appOrigin()}/enterprise?workspace=${workspace}&view=billing`,
        });
        return { url: session.customerPortalUrl };
      }
      if (data.action === "quantity") {
        if (
          !sub?.provider_id ||
          !["active", "trialing"].includes(sub.status as string)
        )
          throw new EnterpriseError(409, "Start a subscription first.");
        const [count] =
          await sql`select count(*)::int as count from enterprise.tenants where workspace_id=${workspace} and kind in ('production','customer') and status<>'disconnected'`;
        if (data.quantity < Number(count?.count ?? 0))
          throw new EnterpriseError(
            409,
            "Disconnect tenants exceeding the requested capacity first.",
          );
        await polar().subscriptions.update({
          id: sub.provider_id as string,
          subscriptionUpdate: {
            seats: data.quantity,
            prorationBehavior: "invoice",
          },
        });
        await audit(
          sql,
          workspace,
          member.user_id,
          "billing.quantity_requested",
          null,
          { quantity: data.quantity },
        );
        return {
          updated: true,
          message:
            "Capacity updates after Polar confirms the subscription change.",
        };
      }
      const terminated =
        sub?.provider_id &&
        !["active", "trialing", "past_due"].includes(sub.status as string) &&
        sub.paid_through &&
        new Date(sub.paid_through as string).getTime() < Date.now();
      if (sub?.provider_id && !terminated)
        throw new EnterpriseError(
          409,
          "Manage the existing subscription in the billing portal.",
        );
      const [pending] = await sql<
        RecordRow[]
      >`select * from enterprise.records where workspace_id=${workspace} and kind='billing_checkout' and status='pending' and expires_at>now() order by created_at desc limit 1`;
      if (pending) {
        if (
          pending.data.quantity !== data.quantity ||
          pending.data.interval !== data.interval ||
          pending.data.founders !== data.founders ||
          (pending.data.trial ?? true) !== (data.trial && !sub?.provider_id)
        )
          throw new EnterpriseError(
            409,
            "A checkout is already open with different billing choices. Complete it or wait for its expiry before changing the selection.",
          );
        return { url: pending.data.url as string };
      }
      if (sub?.founders_at && data.founders)
        throw new EnterpriseError(
          409,
          "A terminated founders offer cannot be restarted.",
        );
      const [tenantCount] =
        await sql`select count(*)::int as count from enterprise.tenants where workspace_id=${workspace} and kind in ('production','customer') and status<>'disconnected'`;
      if (Number(tenantCount?.count ?? 0) > data.quantity)
        throw new EnterpriseError(
          409,
          "Disconnect tenants exceeding the selected capacity before checkout.",
        );
      const allowTrial = data.trial && !sub?.provider_id;
      if (allowTrial) {
        const [claim] =
          await sql`select enterprise.claim_trial(${workspace}) as allowed`;
        if (!claim?.allowed)
          throw new EnterpriseError(
            409,
            "You have already used a workspace trial. Turn off the trial option to subscribe immediately.",
          );
      }
      const quote = price(plan, data.quantity, data.interval, data.founders);
      if (data.founders && Date.now() >= Date.parse(FOUNDERS_END))
        throw new EnterpriseError(410, "Founders enrollment has ended.");
      let discountId: string | undefined;
      if (data.founders) {
        discountId = process.env.POLAR_FOUNDERS_DISCOUNT_ID;
        if (!discountId)
          throw new EnterpriseError(503, "Founders billing is not configured.");
        const discount = await polar().discounts.get({ id: discountId });
        if (
          discount.type !== "percentage" ||
          discount.duration !== "repeating" ||
          !("basisPoints" in discount) ||
          discount.basisPoints !== 5000 ||
          !("durationInMonths" in discount) ||
          discount.durationInMonths !== 12 ||
          !discount.endsAt ||
          discount.endsAt.getTime() !== Date.parse(FOUNDERS_END)
        )
          throw new EnterpriseError(
            503,
            "Founders discount configuration requires review.",
          );
      }
      const id = product(plan, data.interval);
      const catalog = await polar().products.get({ id });
      if (
        !catalog.isRecurring ||
        catalog.recurringInterval !== data.interval ||
        catalog.recurringIntervalCount !== 1
      )
        throw new EnterpriseError(
          503,
          "The configured product has an incorrect recurring interval.",
        );
      const checkout = await polar().checkouts.create({
        products: [id],
        prices: { [id]: catalogPrices(plan, data.interval) },
        seats: data.quantity,
        minSeats: data.quantity,
        maxSeats: data.quantity,
        discountId,
        allowDiscountCodes: false,
        externalCustomerId: workspace,
        isBusinessCustomer: true,
        allowTrial,
        trialInterval: "day",
        trialIntervalCount: 30,
        metadata: {
          workspace_id: workspace,
          plan,
          interval: data.interval,
          quantity: data.quantity,
          founders: data.founders,
        },
        successUrl: `${appOrigin()}/enterprise?workspace=${workspace}&view=billing&checkout=complete`,
        returnUrl: `${appOrigin()}/enterprise?workspace=${workspace}&view=billing`,
      });
      await insertRecord(
        sql,
        workspace,
        null,
        "billing_checkout",
        "Subscription checkout",
        {
          checkoutId: checkout.id,
          url: checkout.url,
          trial: allowTrial,
          quantity: data.quantity,
          interval: data.interval,
          founders: data.founders,
        },
        member.user_id,
        undefined,
        "pending",
        checkout.expiresAt.toISOString(),
      );
      await audit(
        sql,
        workspace,
        member.user_id,
        "billing.checkout_created",
        null,
        {
          checkoutId: checkout.id,
          quantity: data.quantity,
          founders: data.founders,
          quote: quote.cents,
        },
      );
      return { url: checkout.url };
    },
  );
}
export function verifyBillingEvent(
  body: string,
  headers: Record<string, string>,
) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret)
    throw new EnterpriseError(
      503,
      "Billing event verification is not configured.",
    );
  const format = process.env.POLAR_WEBHOOK_SECRET_FORMAT ?? "standard";
  try {
    return z
      .object({
        type: z.string(),
        data: z.object({ id: z.string() }).passthrough(),
      })
      .parse(
        new Webhook(
          format === "legacy" ? Buffer.from(secret).toString("base64") : secret,
        ).verify(body, headers),
      );
  } catch {
    throw new EnterpriseError(
      400,
      "Invalid billing event signature or payload.",
    );
  }
}
export async function receiveBilling(request: Request) {
  const body = await request.text();
  if (body.length > 1000000) throw new EnterpriseError(413, "Event too large.");
  const event = verifyBillingEvent(body, Object.fromEntries(request.headers));
  const id = request.headers.get("webhook-id");
  if (!id) throw new EnterpriseError(400, "Missing event identifier.");
  const subject = event.type.startsWith("subscription.")
    ? event.data.id
    : typeof event.data.subscription_id === "string"
      ? event.data.subscription_id
      : null;
  if (subject)
    await systemTransaction(async (sql) => {
      await sql`insert into enterprise.billing_events(id,type,subject_id) values(${id},${event.type},${subject}) on conflict do nothing`;
    });
  return { received: true };
}
export async function reconcileBilling() {
  if (!process.env.POLAR_ACCESS_TOKEN) return;
  // A daily authoritative refresh also repairs missed webhook deliveries.
  await systemTransaction(async (sql) => {
    await sql`insert into enterprise.billing_events(id,type,subject_id) select 'reconcile:'||provider_id||':'||current_date::text,'reconcile',provider_id from enterprise.subscriptions where provider_id is not null and (synced_at is null or synced_at<now()-interval '1 day') on conflict do nothing`;
  });
  const pending = await systemTransaction(
    (sql) =>
      sql<
        { id: string; subject_id: string }[]
      >`select id,subject_id from enterprise.billing_events where processed_at is null and attempts<5 order by received_at limit 2`,
  );
  for (const event of pending) {
    try {
      // Fetch current provider state instead of trusting event ordering or redirects.
      const sub = await polar().subscriptions.get({ id: event.subject_id });
      const workspace = z.string().uuid().parse(sub.metadata.workspace_id);
      await systemTransaction(async (sql) => {
        const [ws] =
          await sql`select plan from enterprise.workspaces where id=${workspace} for update`;
        if (!ws) throw new Error("Unknown billing workspace");
        const interval = sub.recurringInterval === "year" ? "year" : "month";
        if (sub.productId !== product(ws.plan as Plan, interval))
          throw new Error("Billing product does not match workspace");
        const [prior] =
          await sql`select provider_id,last_event_at,status,paid_through from enterprise.subscriptions where workspace_id=${workspace}`;
        if (prior?.provider_id !== sub.id) {
          const [checkout] =
            await sql`select id from enterprise.records where workspace_id=${workspace} and kind='billing_checkout' and data->>'checkoutId'=${sub.checkoutId ?? ""}`;
          if (!checkout)
            throw new Error(
              "Subscription has no authenticated workspace checkout",
            );
          if (prior?.provider_id) {
            const previousEnded =
              !["active", "trialing", "past_due"].includes(
                prior.status as string,
              ) &&
              prior.paid_through &&
              new Date(prior.paid_through as string).getTime() < Date.now();
            if (!previousEnded) {
              if (!["active", "trialing"].includes(sub.status)) {
                await sql`update enterprise.billing_events set processed_at=now() where id=${event.id}`;
                return;
              }
              throw new Error(
                "Duplicate active workspace subscription requires review",
              );
            }
          }
        }
        const modified = sub.modifiedAt ?? sub.createdAt;
        if (
          prior?.last_event_at &&
          new Date(prior.last_event_at as string) > modified
        ) {
          await sql`update enterprise.billing_events set processed_at=now() where id=${event.id}`;
          return;
        }
        const founders =
          sub.metadata.founders === true &&
          sub.createdAt.getTime() < Date.parse(FOUNDERS_END) &&
          sub.discountId === process.env.POLAR_FOUNDERS_DISCOUNT_ID;
        const discountEnd = founders
          ? monthsAfter(sub.trialEnd ?? sub.startedAt ?? sub.createdAt, 12)
          : null;
        await sql`update enterprise.subscriptions set discount_ends_at=${discountEnd},provider_id=${sub.id},customer_id=${sub.customerId},status=${sub.status},product_id=${sub.productId},interval=${interval},quantity=${sub.seats ?? 0},paid_through=${sub.currentPeriodEnd},trial_ends_at=${sub.trialEnd},founders_at=coalesce(founders_at,${founders ? sub.createdAt : null}),cancel_at_period_end=${sub.cancelAtPeriodEnd},last_event_at=${modified},synced_at=now() where workspace_id=${workspace}`;
        await sql`update enterprise.records set status='completed' where workspace_id=${workspace} and kind='billing_checkout' and status='pending'`;
        await sql`update enterprise.billing_events set processed_at=now(),workspace_id=${workspace},error=null where id=${event.id}`;
        await audit(sql, workspace, null, "billing.reconciled", null, {
          subscriptionId: sub.id,
          status: sub.status,
        });
      });
    } catch {
      await systemTransaction(async (sql) => {
        await sql`update enterprise.billing_events set attempts=attempts+1,error='Provider reconciliation failed; check product mapping and subscription ownership.' where id=${event.id}`;
      });
    }
  }
}
