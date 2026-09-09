"use client";
import { useState, useEffect, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field } from "./ui";
import { api } from "./session";
import { type Standard, type Role } from "~/lib/enterprise/domain";
export type Tenant = {
  id: string;
  name: string;
  tenant_id: string;
  kind: string;
  status: string;
  last_collected_at: string | null;
  health: string | null;
  branding: Record<string, string>;
};
export function CreateForm({
  kind,
  workspace,
  customer,
  tenants,
  plan,
  submit,
  busy,
  close,
}: {
  kind: string;
  workspace: string;
  customer: string;
  tenants: Tenant[];
  plan: string;
  submit: (data: any) => Promise<void>;
  busy: boolean;
  close: () => void;
}) {
  const [rules, setRules] = useState<Standard["rules"]>([
    {
      id: crypto.randomUUID(),
      name: "",
      section: "settingsCatalog",
      path: "/",
      operator: "equals",
      expected: true,
      severity: "medium",
    },
  ]);
  const [scope, setScope] = useState<string[]>(customer ? [customer] : []),
    [all, setAll] = useState(!customer),
    [localError, setLocalError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(customer);
  const [evidence, setEvidence] = useState<
    Array<{
      id: string;
      name: string;
      customer_id: string | null;
      created_at: string;
    }>
  >([]);
  useEffect(() => {
    const kinds =
      kind === "standard"
        ? ["standard"]
        : kind === "exception"
          ? ["finding"]
          : kind === "review"
            ? ["snapshot"]
            : kind === "annotation"
              ? ["finding", "snapshot"]
              : [];
    if (!workspace || !kinds.length) return;
    let active = true;
    setEvidence([]);
    void Promise.all(
      kinds.map((k) =>
        api<{ records: typeof evidence }>(
          `workspaces/${workspace}/records?kind=${k}${selectedCustomer && kind !== "standard" ? `&customer=${selectedCustomer}` : ""}`,
        ),
      ),
    )
      .then((results) => {
        if (active)
          setEvidence(
            results
              .flatMap((r) => r.records)
              .filter((r) => kind !== "standard" || r.customer_id === null),
          );
      })
      .catch((error) => {
        if (active)
          setLocalError(
            error instanceof Error
              ? error.message
              : "Unable to load evidence choices.",
          );
      });
    return () => {
      active = false;
    };
  }, [workspace, kind, selectedCustomer]);
  function evidenceSelect(name: string, optional = false) {
    return (
      <select name={name} required={!optional} defaultValue="">
        <option value="">
          {optional ? "No template override" : "Select captured evidence"}
        </option>
        {evidence.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} ({new Date(item.created_at).toLocaleString()})
          </option>
        ))}
      </select>
    );
  }
  const [ruleTypes, setRuleTypes] = useState<Record<string, string>>({});
  function changeRule(index: number, key: string, value: unknown) {
    setRules((old) =>
      old.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    const data = new FormData(event.currentTarget),
      get = (key: string) => (data.get(key) as string | null) ?? "";
    try {
      if (kind === "workspace")
        return await submit({ name: get("name"), plan: get("plan") });
      if (kind === "tenant") {
        const rows = get("tenants")
          .split("\n")
          .filter((v) => v.trim())
          .map((row) => {
            const [name, tenantId, kind] = row.split(",").map((s) => s.trim());
            return {
              name,
              tenantId,
              kind: kind || (plan === "msp" ? "customer" : "production"),
            };
          });
        return await submit({
          tenants: rows,
          acknowledged: data.get("acknowledged") === "on",
        });
      }
      if (kind === "invite")
        return await submit({
          email: get("email"),
          role: get("role"),
          scope: all ? null : scope,
          expiresAt: get("expiresAt")
            ? new Date(get("expiresAt")).toISOString()
            : null,
        });
      const customerId = get("customer") || customer || null,
        name = get("name");
      let content: Record<string, unknown> = {};
      if (kind === "standard")
        content = {
          name,
          description: get("description"),
          definitionVersion: Number(get("definitionVersion") || 1),
          ...(get("templateId") ? { templateId: get("templateId") } : {}),
          rules: rules.map((r) => ({
            ...r,
            expected:
              (ruleTypes[r.id] ?? "boolean") === "number"
                ? Number(r.expected)
                : (ruleTypes[r.id] ?? "boolean") === "boolean"
                  ? String(r.expected) === "true"
                  : r.expected,
          })),
        };
      if (kind === "exception")
        content = {
          findingId: get("findingId"),
          owner: get("owner"),
          reason: get("reason"),
          expiresAt: new Date(get("expiresAt")).toISOString(),
        };
      if (kind === "review")
        content = {
          snapshotId: get("snapshotId"),
          statement: get("statement"),
        };
      if (kind === "annotation")
        content = {
          recordId: get("recordId"),
          note: get("note"),
          ticket: get("ticket"),
        };
      if (kind === "schedule")
        content = {
          cadence: get("cadence"),
          hour: Number(get("hour")),
          timezone: get("timezone"),
          format: get("format"),
          template: get("template"),
          recipients: get("recipients")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          nextRun: new Date(get("nextRun")).toISOString(),
          enabled: true,
        };
      if (kind === "alert_route")
        content = {
          recipients: get("recipients")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          events: ["drift.detected", "collection.completed"],
        };
      if (kind === "webhook")
        content = {
          url: get("url"),
          events: ["collection.completed", "drift.detected", "report.ready"],
        };
      if (kind === "api_key")
        content = { expiresAt: new Date(get("expiresAt")).toISOString() };
      if (kind === "maintenance")
        content = {
          startsAt: new Date(get("startsAt")).toISOString(),
          endsAt: new Date(get("endsAt")).toISOString(),
          reason: get("reason"),
        };
      await submit({ kind, customerId, name, data: content });
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Check the form and try again.",
      );
    }
  }
  return (
    <form onSubmit={send}>
      {localError && (
        <div role="alert" className="ent-error">
          {localError}
        </div>
      )}
      {!["tenant", "invite"].includes(kind) && (
        <Field label={kind === "workspace" ? "Workspace name" : "Name"}>
          <input
            name="name"
            required
            maxLength={240}
            placeholder={
              kind === "workspace" ? "Contoso IT" : "A descriptive name"
            }
            autoFocus
          />
        </Field>
      )}
      {kind === "workspace" && (
        <>
          <Field label="Plan">
            <select name="plan" defaultValue="enterprise">
              <option value="enterprise">Enterprise · $149/month</option>
              <option value="msp">MSP · $249/month</option>
            </select>
          </Field>
          <p className="ent-footer-note">
            Creating a workspace does not charge you. Choose a subscription or
            30-day trial in Billing before connecting tenants.
          </p>
        </>
      )}
      {kind === "tenant" && (
        <>
          <Field
            label="Tenants"
            hint={`One tenant per line: name, Microsoft tenant ID, type. Allowed types: ${plan === "msp" ? "customer, internal" : "production, test"}. Every tenant needs its own admin consent.`}
          >
            <textarea
              name="tenants"
              required
              rows={7}
              placeholder={`Contoso, 00000000-0000-0000-0000-000000000000, ${plan === "msp" ? "customer" : "production"}`}
            />
          </Field>
          <label className="ent-check">
            <input name="acknowledged" type="checkbox" required />
            <span>
              I authorize read-only background collection and encrypted EU
              configuration history, retained for up to 12 months while
              subscribed.
            </span>
          </label>
        </>
      )}
      {kind === "invite" && (
        <>
          <Field label="Business email">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="viewer">
              <option value="admin">Administrator</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
              <option value="auditor">Auditor, expiry required</option>
            </select>
          </Field>
          <Field label="Access expires (optional except auditors)">
            <input name="expiresAt" type="datetime-local" />
          </Field>
          <label className="ent-check">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
            />
            All customers, including future additions
          </label>
          {!all &&
            tenants.map((t) => (
              <label className="ent-check" key={t.id}>
                <input
                  type="checkbox"
                  checked={scope.includes(t.id)}
                  onChange={(e) =>
                    setScope((old) =>
                      e.target.checked
                        ? [...old, t.id]
                        : old.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          <p className="ent-footer-note">
            Members must verify the invited mailbox after Microsoft sign-in. A
            matching company domain does not grant access.
          </p>
        </>
      )}
      {!["workspace", "tenant", "invite"].includes(kind) && (
        <Field label="Customer scope">
          <select
            name="customer"
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            required={kind !== "standard"}
          >
            <option value="">
              {kind === "standard"
                ? "All workspace customers"
                : "Select customer"}
            </option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {kind === "standard" && (
        <>
          <Field label="Description">
            <textarea name="description" maxLength={4000} />
          </Field>
          <div className="ent-form-grid">
            <Field label="Definition version">
              <input
                name="definitionVersion"
                type="number"
                min={1}
                defaultValue={1}
                required
              />
            </Field>
            <Field
              label="Override workspace template (optional)"
              hint="Select a published workspace standard and one customer to override its checks."
            >
              {evidenceSelect("templateId", true)}
            </Field>
          </div>
          <h3 className="ent-eyebrow">Deterministic policy checks</h3>
          {rules.map((rule, index) => (
            <div className="ent-rule" key={rule.id}>
              <div
                className="ent-actions"
                style={{ justifyContent: "space-between", marginBottom: 10 }}
              >
                <strong>Rule {index + 1}</strong>
                {rules.length > 1 && (
                  <button
                    type="button"
                    className="ent-icon"
                    aria-label={`Remove rule ${index + 1}`}
                    onClick={() =>
                      setRules((old) => old.filter((r) => r.id !== rule.id))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <Field label="Rule name">
                <input
                  value={rule.name}
                  required
                  onChange={(e) => changeRule(index, "name", e.target.value)}
                />
              </Field>
              <div className="ent-form-grid">
                <Field label="Snapshot section key">
                  <input
                    required
                    value={rule.section}
                    onChange={(e) =>
                      changeRule(index, "section", e.target.value)
                    }
                  />
                </Field>
                <Field label="Setting path (JSON Pointer)">
                  <input
                    required
                    value={rule.path}
                    onChange={(e) => changeRule(index, "path", e.target.value)}
                    placeholder="/settings/0/value"
                  />
                </Field>
                <Field label="Comparison">
                  <select
                    value={rule.operator}
                    onChange={(e) =>
                      changeRule(index, "operator", e.target.value)
                    }
                  >
                    <option value="equals">Equals</option>
                    <option value="notEquals">Does not equal</option>
                    <option value="contains">Contains</option>
                    <option value="exists">Exists</option>
                  </select>
                </Field>
                <Field label="Severity">
                  <select
                    value={rule.severity}
                    onChange={(e) =>
                      changeRule(index, "severity", e.target.value)
                    }
                  >
                    {["low", "medium", "high", "critical"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Value type">
                  <select
                    value={ruleTypes[rule.id] ?? "boolean"}
                    onChange={(e) =>
                      setRuleTypes((old) => ({
                        ...old,
                        [rule.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="boolean">Boolean</option>
                    <option value="string">Text</option>
                    <option value="number">Number</option>
                  </select>
                </Field>
                <Field label="Expected value">
                  <input
                    value={String(rule.expected)}
                    onChange={(e) =>
                      changeRule(index, "expected", e.target.value)
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            className="ent-button"
            type="button"
            onClick={() =>
              setRules((old) => [
                ...old,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  section: "settingsCatalog",
                  path: "/",
                  operator: "equals",
                  expected: true,
                  severity: "medium",
                },
              ])
            }
          >
            <Plus size={14} />
            Add rule
          </button>
          <p className="ent-footer-note">
            Each published definition is immutable. Archive and publish a new
            version to change requirements. Missing evidence is reported as
            unknown.
          </p>
        </>
      )}
      {kind === "exception" && (
        <>
          <Field label="Finding">{evidenceSelect("findingId")}</Field>
          <Field label="Responsible owner">
            <input name="owner" required />
          </Field>
          <Field label="Business reason">
            <textarea name="reason" required minLength={10} />
          </Field>
          <Field label="Expiry">
            <input name="expiresAt" type="datetime-local" required />
          </Field>
          <p className="ent-footer-note">
            A different administrator must approve this exception. Collected
            evidence remains unchanged.
          </p>
        </>
      )}
      {kind === "review" && (
        <>
          <Field label="Captured configuration">
            {evidenceSelect("snapshotId")}
          </Field>
          <Field label="Sign-off statement">
            <textarea
              name="statement"
              required
              minLength={10}
              placeholder="I reviewed the captured configuration and the stated limitations…"
            />
          </Field>
          <label className="ent-check">
            <input type="checkbox" required />
            <span>
              I understand this sign-off is attached to immutable evidence and
              my current identity.
            </span>
          </label>
        </>
      )}
      {kind === "annotation" && (
        <>
          <Field label="Evidence or finding">
            {evidenceSelect("recordId")}
          </Field>
          <Field label="Investigation note">
            <textarea name="note" required />
          </Field>
          <Field label="Change or ticket reference (optional)">
            <input name="ticket" placeholder="CHG-1042 or a ticket URL" />
          </Field>
        </>
      )}
      {kind === "schedule" && (
        <>
          <div className="ent-form-grid">
            <Field label="Cadence">
              <select name="cadence">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly, Monday</option>
                <option value="monthly">Monthly, first day</option>
                <option value="quarterly">Quarterly, first day</option>
              </select>
            </Field>
            <Field label="Local hour">
              <input
                type="number"
                name="hour"
                min={0}
                max={23}
                defaultValue={8}
                required
              />
            </Field>
            <Field label="Timezone">
              <input
                name="timezone"
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
                required
              />
            </Field>
            <Field label="First run">
              <input name="nextRun" type="datetime-local" required />
            </Field>
            <Field label="Template">
              <select name="template">
                <option value="detailed">Full documentation</option>
                <option value="executive">Executive summary</option>
                <option value="qbr">Quarterly business review</option>
              </select>
            </Field>
            <Field label="Format">
              <select name="format">
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
              </select>
            </Field>
          </div>
          <Field
            label="Email recipients"
            hint="Comma separated. Emails contain private library links, not configuration attachments."
          >
            <input
              name="recipients"
              placeholder="it@contoso.com, reviewer@contoso.com"
            />
          </Field>
        </>
      )}
      {kind === "alert_route" && (
        <Field
          label="Alert recipients"
          hint="Comma separated. Alerts contain only an authenticated link to the customer workspace."
        >
          <input
            name="recipients"
            required
            placeholder="operations@contoso.com"
          />
        </Field>
      )}
      {kind === "webhook" && (
        <>
          <Field label="Public HTTPS endpoint">
            <input
              name="url"
              type="url"
              required
              placeholder="https://your-service.example/webhooks/intune"
            />
          </Field>
          <p className="ent-footer-note">
            Events: collection completed, drift detected, and report ready. The
            signing secret is shown once after creation. Private network
            destinations are blocked.
          </p>
        </>
      )}
      {kind === "api_key" && (
        <>
          <Field label="Credential expiry">
            <input name="expiresAt" type="datetime-local" required />
          </Field>
          <p className="ent-footer-note">
            Read-only access for the selected customer. Expires within one year.
            The credential is shown once and is immediately revoked when
            archived.
          </p>
        </>
      )}
      {kind === "maintenance" && (
        <>
          <div className="ent-form-grid">
            <Field label="Starts">
              <input name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="Ends">
              <input name="endsAt" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Reason">
            <input name="reason" required />
          </Field>
        </>
      )}
      <footer>
        <button type="button" className="ent-button" onClick={close}>
          Cancel
        </button>
        <button className="ent-button primary" disabled={busy}>
          {busy
            ? "Saving…"
            : kind === "invite"
              ? "Send invitation"
              : kind === "review"
                ? "Sign off evidence"
                : "Save"}
        </button>
      </footer>
    </form>
  );
}
export function MemberForm({
  member,
  submit,
  close,
  busy,
  tenants,
}: {
  tenants: Tenant[];
  member: {
    user_id: string;
    role: Role;
    customer_scope: string[] | null;
    expires_at: string | null;
  };
  submit: (data: unknown) => Promise<void>;
  close: () => void;
  busy: boolean;
}) {
  const [scope, setScope] = useState<string[] | null>(member.customer_scope);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await submit({
          role: data.get("role"),
          scope,
          expiresAt: data.get("expiresAt")
            ? new Date(data.get("expiresAt") as string).toISOString()
            : null,
          remove: data.get("remove") === "on",
        });
      }}
    >
      <Field label="Member">
        <input readOnly value={member.user_id} />
      </Field>
      <Field label="Role">
        <select name="role" defaultValue={member.role}>
          {["owner", "admin", "analyst", "viewer", "auditor"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <label className="ent-check">
        <input
          type="checkbox"
          checked={scope === null}
          onChange={(e) => setScope(e.target.checked ? null : [])}
        />
        All customers, including future additions
      </label>
      {scope !== null &&
        tenants.map((t) => (
          <label key={t.id} className="ent-check">
            <input
              type="checkbox"
              checked={scope.includes(t.id)}
              onChange={(e) =>
                setScope((old) =>
                  e.target.checked
                    ? [...(old ?? []), t.id]
                    : (old ?? []).filter((id) => id !== t.id),
                )
              }
            />
            {t.name}
          </label>
        ))}
      <Field label="Expiry">
        <input
          name="expiresAt"
          type="datetime-local"
          defaultValue={
            member.expires_at
              ? new Date(member.expires_at).toISOString().slice(0, 16)
              : ""
          }
        />
      </Field>
      <label className="ent-check">
        <input name="remove" type="checkbox" />
        Remove this member from the workspace
      </label>
      <footer>
        <button type="button" className="ent-button" onClick={close}>
          Cancel
        </button>
        <button className="ent-button primary" disabled={busy}>
          Update access
        </button>
      </footer>
    </form>
  );
}
