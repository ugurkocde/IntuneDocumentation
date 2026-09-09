"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { api, enterpriseSession, signIn, signOut } from "./session";
import { Badge, DateLabel, Empty, Field, Modal, Support } from "./ui";
import { CreateForm, MemberForm, type Tenant } from "./forms";
import {
  allowed,
  FOUNDERS_END,
  type Member,
  type Plan,
  price,
} from "~/lib/enterprise/domain";
type View =
  | "overview"
  | "customers"
  | "history"
  | "drift"
  | "standards"
  | "audits"
  | "reports"
  | "team"
  | "integrations"
  | "billing"
  | "activity";
type Row = {
  id: string;
  customer_id: string | null;
  kind: string;
  name: string;
  status: string;
  created_at: string;
  data: Record<string, any>;
  content?: unknown;
};
type Workspace = { id: string; name: string; plan: Plan; role: string };
type Detail = {
  workspace: Workspace;
  member: Member;
  tenants: Tenant[];
  subscription: {
    status: string;
    provider_id?: string | null;
    quantity: number;
    interval: "month" | "year";
    founders_at: string | null;
    discount_ends_at?: string | null;
    paid_through: string | null;
    trial_ends_at: string | null;
    cancel_at_period_end: boolean;
  };
};
const nav: Array<{
  id: View;
  label: string;
  icon: typeof Activity;
  manage?: boolean;
  owner?: boolean;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "customers", label: "Tenants & customers", icon: Building2 },
  { id: "history", label: "Configuration history", icon: FileClock },
  { id: "drift", label: "Drift & findings", icon: Activity },
  { id: "standards", label: "Standards", icon: SlidersHorizontal },
  { id: "audits", label: "Audit workspace", icon: FileCheck2 },
  { id: "reports", label: "Report library", icon: FileText },
  { id: "team", label: "Team & access", icon: Users, manage: true },
  { id: "integrations", label: "API & webhooks", icon: Network, manage: true },
  { id: "billing", label: "Billing", icon: CreditCard, owner: true },
  { id: "activity", label: "Activity log", icon: Clock3 },
];
const descriptions: Record<View, string> = {
  overview:
    "A clear view of your documentation, collection health, and the work that needs attention.",
  customers:
    "Connect each Microsoft tenant with separate, read-only admin consent.",
  history:
    "Inspect captured configuration and compare changes over time. Evidence stays tied to its collection date.",
  drift:
    "Investigate changes against approved baselines and your own configuration standards.",
  standards:
    "Define reusable configuration requirements. Missing evidence stays unknown.",
  audits:
    "Connect evidence, exceptions, reviewer sign-offs, and change accountability.",
  reports:
    "Full documentation, executive summaries, and customer review packs, in one private library.",
  team: "Invite your team and grant only the access they need. Human members are unlimited.",
  integrations:
    "A small read-only API and signed outbound events, scoped to individual customers.",
  billing:
    "Manage your plan, monitored tenant capacity, invoices, and the founders offer.",
  activity:
    "A chronological record of workspace actions. Microsoft change attribution is shown only when verified.",
};
const kindMap: Partial<Record<View, string[]>> = {
  overview: ["snapshot", "finding", "report"],
  history: ["snapshot", "baseline"],
  drift: ["finding", "exception"],
  standards: ["standard"],
  audits: ["exception", "review", "annotation", "maintenance"],
  reports: ["report", "schedule", "snapshot"],
  integrations: ["api_key", "webhook", "alert_route"],
};
export function EnterpriseApp() {
  const [phase, setPhase] = useState<"loading" | "signedOut" | "ready">(
      "loading",
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [workspace, setWorkspace] = useState(""),
    [customer, setCustomer] = useState(""),
    [view, setView] = useState<View>("overview"),
    [name, setName] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [events, setEvents] = useState<any[]>([]),
    [jobs, setJobs] = useState<any[]>([]),
    [team, setTeam] = useState<{ members: any[]; invitations: any[] }>({
      members: [],
      invitations: [],
    });
  const [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [modal, setModal] = useState(""),
    [inspect, setInspect] = useState<any>(null),
    [secret, setSecret] = useState(""),
    [editMember, setEditMember] = useState<any>(null),
    [inviteToken, setInviteToken] = useState(""),
    [verification, setVerification] = useState(false),
    [tab, setTab] = useState("");
  const sequence = useRef(0);
  const [connection, setConnection] = useState<{
    token: string;
    tenant: string;
    workspace_name?: string;
    customer_name?: string;
    requested_by?: string;
  } | null>(null);
  useEffect(() => {
    if (!connection?.token || phase !== "ready") return;
    let active = true;
    void api<{
      workspace_name: string;
      customer_name: string;
      requested_by: string;
    }>(`connection-info?token=${encodeURIComponent(connection.token)}`)
      .then((info) => {
        if (active) setConnection((old) => (old ? { ...old, ...info } : null));
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load connection request.",
          );
      });
    return () => {
      active = false;
    };
  }, [connection?.token, phase]);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [cursors, setCursors] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  async function loadWorkspaces() {
    const result = await api<{
      user: { name: string };
      workspaces: Workspace[];
    }>("workspaces");
    setWorkspaces(result.workspaces);
    setName(result.user.name);
    return result.workspaces;
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const query = new URLSearchParams(location.search),
          invitation = query.get("invite");
        if (invitation) {
          sessionStorage.setItem("enterprise.invitation", invitation);
          query.delete("invite");
          history.replaceState(null, "", `/enterprise?${query}`);
        }
        setInviteToken(sessionStorage.getItem("enterprise.invitation") ?? "");
        const connectionToken = query.get("connection"),
          connectionTenant = query.get("tenant");
        if (
          connectionToken &&
          connectionTenant &&
          /^[a-fA-F0-9-]{36}$/.test(connectionTenant)
        )
          sessionStorage.setItem(
            "enterprise.connection",
            JSON.stringify({
              token: connectionToken,
              tenant: connectionTenant,
            }),
          );
        query.delete("connection");
        query.delete("tenant");
        history.replaceState(null, "", `/enterprise?${query}`);
        const storedConnection = sessionStorage.getItem(
          "enterprise.connection",
        );
        if (storedConnection)
          setConnection(
            JSON.parse(storedConnection) as { token: string; tenant: string },
          );

        const app = await enterpriseSession();
        if (!active) return;
        if (!app.getActiveAccount()) {
          setPhase("signedOut");
          return;
        }
        const list = await loadWorkspaces();
        if (!active) return;
        const selected = query.get("workspace");
        setWorkspace(
          list.some((w) => w.id === selected) ? selected! : (list[0]?.id ?? ""),
        );
        setCustomer(query.get("customer") ?? "");
        const requested = query.get("view");
        if (nav.some((n) => n.id === requested)) setView(requested as View);
        setPhase("ready");
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Unable to initialize sign-in.",
          );
          setPhase("signedOut");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!workspace || phase !== "ready") return;
    const request = ++sequence.current;
    setLoading(true);
    setRows([]);
    setEvents([]);
    setJobs([]);
    setError("");
    void (async () => {
      try {
        const base = `workspaces/${workspace}`,
          data = await api<Detail>(base);
        if (sequence.current !== request) return;
        setDetail(data);
        if (customer && !data.tenants.some((t) => t.id === customer)) {
          setCustomer("");
          return;
        }
        const suffix = customer ? `&customer=${customer}` : "";
        const sets = await Promise.all(
          (kindMap[view] ?? []).map((kind) =>
            api<{ records: Row[]; nextCursor?: string | null }>(
              `${base}/records?kind=${kind}${suffix}&q=${encodeURIComponent(query)}`,
            ),
          ),
        );
        const extra =
          view === "team"
            ? await api(`${base}/team`)
            : view === "activity" || view === "overview"
              ? await api(
                  `${base}/activity?${customer ? `customer=${customer}` : ""}`,
                )
              : null;
        const jobResult = [
          "overview",
          "customers",
          "history",
          "reports",
        ].includes(view)
          ? await api(`${base}/jobs?${customer ? `customer=${customer}` : ""}`)
          : { jobs: [] };
        if (sequence.current !== request) return;
        setRows(sets.flatMap((s) => s.records));
        setCursors(
          Object.fromEntries(
            (kindMap[view] ?? []).map((kind, index) => [
              kind,
              sets[index]?.nextCursor ?? null,
            ]),
          ),
        );
        setJobs(jobResult.jobs);
        if (view === "team") setTeam(extra);
        else if (extra) setEvents(extra.events);
        const addressQuery = new URLSearchParams({ workspace, view });
        if (customer) addressQuery.set("customer", customer);
        history.replaceState(null, "", `/enterprise?${addressQuery}`);
      } catch (e) {
        if (sequence.current === request)
          setError(
            e instanceof Error ? e.message : "Unable to load workspace.",
          );
      } finally {
        if (sequence.current === request) setLoading(false);
      }
    })();
  }, [workspace, customer, view, revision, phase, query]);
  useEffect(() => {
    if (!jobs.some((j) => ["queued", "running"].includes(j.status as string)))
      return;
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [jobs, refresh]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not complete.",
      );
    } finally {
      setBusy(false);
    }
  }
  const base = `workspaces/${workspace}`,
    member = detail?.member,
    manage = member ? allowed(member, "manage", customer) : false,
    investigate = member ? allowed(member, "investigate", customer) : false,
    approve = member ? allowed(member, "approve", customer) : false,
    review = member ? allowed(member, "review", customer) : false;
  function navigate(next: View) {
    setView(next);
    setTab("");
    setSearch("");
    setQuery("");
    setCursors({});
    setInspect(null);
  }
  async function create(data: any) {
    let result: any;
    if (modal === "workspace") {
      result = await api("workspaces", data);
      await loadWorkspaces();
      setWorkspace(result.id as string);
      setCustomer("");
      setDetail(null);
      navigate("billing");
    } else
      result = await api(
        `${base}/${modal === "tenant" ? "tenants" : modal === "invite" ? "team" : "records"}`,
        data,
      );
    if (result.credential || result.secret)
      setSecret(
        result.credential
          ? String(result.credential)
          : String(result.secret.signingSecret),
      );
    setModal("");
    setNotice(
      modal === "invite"
        ? "Invitation sent. The recipient will verify their mailbox before joining."
        : "Saved successfully.",
    );
    refresh();
  }
  async function action(row: Row, act: string, otherId?: string) {
    await api(`${base}/records/${row.id}`, {
      action: act,
      customerId: row.customer_id,
      otherId,
    });
    setNotice("Updated successfully.");
    refresh();
  }
  async function show(row: Row) {
    setInspect(
      await api(
        `${base}/records/${row.id}?${row.customer_id ? `customer=${row.customer_id}` : ""}`,
      ),
    );
  }
  async function download(row: Row) {
    const blob = await api<Blob>(
        `${base}/download/${row.id}?customer=${row.customer_id}`,
        undefined,
        true,
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `${row.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${String(row.data.format)}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const formButton = (kind: string, label: string) => (
    <button className="ent-button primary" onClick={() => setModal(kind)}>
      <Plus size={14} />
      {label}
    </button>
  );
  const filteredTenants =
    detail?.tenants.filter((t) => !customer || t.id === customer) ?? [];
  function table(records: Row[], actions?: (row: Row) => ReactNode) {
    return (
      <div className="ent-table-wrap">
        <table className="ent-table">
          <thead>
            <tr>
              <th>Name / evidence</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Created</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  <small>
                    {row.kind} · {row.id.slice(0, 8)}
                  </small>
                </td>
                <td>
                  {detail?.tenants.find((t) => t.id === row.customer_id)
                    ?.name ?? "Workspace"}
                </td>
                <td>
                  <Badge value={row.status} />
                </td>
                <td>
                  <DateLabel value={row.created_at} />
                </td>
                <td>
                  <div className="ent-actions">
                    {actions?.(row)}
                    {!["api_key", "webhook"].includes(row.kind) && (
                      <button
                        className="ent-button"
                        onClick={() => perform(() => show(row))}
                      >
                        Inspect
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const recordsOf = (kind: string) => rows.filter((r) => r.kind === kind);
  const activeTenant = detail?.tenants.find((t) => t.id === customer);
  const content = () => {
    if (view === "overview")
      return (
        <>
          <div className="ent-grid">
            <Stat
              label="Connected tenants"
              value={
                filteredTenants.filter((t) => t.status === "connected").length
              }
              note={`${filteredTenants.length} tenants in this view`}
              icon={<Building2 size={17} />}
            />
            <Stat
              label="Open findings"
              value={
                recordsOf("finding").filter((r) => r.status === "open").length
              }
              note="In the latest 100 findings"
              icon={<Activity size={17} />}
            />
            <Stat
              label="Reports in library"
              value={recordsOf("report").length}
              note="Latest 100 retained reports"
              icon={<FileText size={17} />}
            />
          </div>
          <div className="ent-split">
            <section className="ent-card">
              <header className="ent-card-head">
                <h2>Tenant health</h2>
                <button
                  className="ent-button quiet"
                  onClick={() => navigate("customers")}
                >
                  Manage
                  <ArrowUpRight size={14} />
                </button>
              </header>
              {tenantTable()}
            </section>
            <section className="ent-card">
              <header className="ent-card-head">
                <h2>Recent activity</h2>
              </header>
              {events.length ? (
                <div className="ent-card-body ent-timeline">
                  {events.slice(0, 6).map((event) => (
                    <div key={event.id}>
                      <strong>
                        {String(event.action).replaceAll(".", " / ")}
                      </strong>
                      <small>
                        <DateLabel value={event.created_at as string} />
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="Your workspace starts here">
                  Connect your first tenant to begin collecting configuration
                  history.
                </Empty>
              )}
            </section>
          </div>
          <div className="ent-banner">
            <div>
              <h2>Documentation with a memory.</h2>
              <p>
                Approve a baseline after your first complete collection. Future
                changes become a reviewable history.
              </p>
            </div>
            <button className="ent-button" onClick={() => navigate("history")}>
              Open configuration history
              <ArrowRight size={14} />
            </button>
          </div>
          {jobCard()}
        </>
      );
    if (view === "customers")
      return (
        <>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>
                {detail?.workspace.plan === "msp"
                  ? "Customer portfolio"
                  : "Corporate tenant overview"}
              </h2>
              {manage &&
                member?.customer_scope === null &&
                formButton("tenant", "Add tenants")}
            </header>
            <p className="ent-section-intro">
              Each tenant is independently authorized. Disconnecting stops
              collection; Microsoft consent is revoked separately in the
              customer&apos;s Entra admin center.
            </p>
            {tenantTable(true)}
          </section>
          {jobCard()}
        </>
      );
    if (view === "history")
      return (
        <>
          <div className="ent-actions" style={{ marginBottom: 18 }}>
            <button
              className="ent-button"
              disabled={recordsOf("snapshot").length < 2}
              onClick={() => setModal("compare")}
            >
              Compare snapshots
            </button>
          </div>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>Configuration snapshots</h2>
              <small>Encrypted · Up to 12 months</small>
            </header>
            {recordsOf("snapshot").length ? (
              table(recordsOf("snapshot"), (row) => (
                <>
                  {approve && row.status === "complete" && (
                    <button
                      className="ent-button"
                      disabled={busy}
                      onClick={() => perform(() => action(row, "baseline"))}
                    >
                      Approve baseline
                    </button>
                  )}
                </>
              ))
            ) : (
              <Empty title="No configuration history yet">
                Connect a tenant and run its first collection. Coverage and any
                failed sections will be visible here.
              </Empty>
            )}
          </section>
          {recordsOf("baseline").length > 0 && (
            <section className="ent-card" style={{ marginTop: 20 }}>
              <header className="ent-card-head">
                <h2>Baseline approvals</h2>
              </header>
              {table(recordsOf("baseline"))}
            </section>
          )}
          {jobCard()}
        </>
      );
    if (view === "drift")
      return (
        <>
          <div className="ent-actions" style={{ marginBottom: 18 }}>
            {investigate && (
              <>
                {formButton("exception", "Request exception")}
                <button
                  className="ent-button"
                  onClick={() => setModal("annotation")}
                >
                  Add investigation note
                </button>
              </>
            )}
          </div>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>Findings & changes</h2>
              <small>Discovered after collection</small>
            </header>
            {recordsOf("finding").length ? (
              table(recordsOf("finding"), (row) => (
                <Badge value={String(row.data.severity ?? "medium")} />
              ))
            ) : (
              <Empty title="No findings recorded">
                A complete collection and an approved baseline or custom
                standard will establish what to monitor. This empty view is not
                a compliance verdict.
              </Empty>
            )}
          </section>
        </>
      );
    if (view === "standards")
      return (
        <section className="ent-card">
          <header className="ent-card-head">
            <h2>Configuration standards</h2>
            {manage && formButton("standard", "Publish standard")}
          </header>
          <p className="ent-section-intro">
            Standards evaluate policy configuration. Publish a new version when
            requirements change; previously collected evidence stays unchanged.
          </p>
          {rows.length ? (
            table(rows, (row) =>
              manage && row.status === "active" ? (
                <button
                  className="ent-button"
                  onClick={() => perform(() => action(row, "archive"))}
                >
                  Archive
                </button>
              ) : null,
            )
          ) : (
            <Empty title="Define your first standard">
              Create deterministic setting checks with explicit expected values
              and severity. Apply them across your workspace or to one customer.
            </Empty>
          )}
        </section>
      );
    if (view === "audits") {
      const selected = tab || "exception";
      return (
        <>
          <div className="ent-tabs">
            {[
              ["exception", "Exceptions"],
              ["review", "Sign-offs"],
              ["annotation", "Notes & tickets"],
              ["maintenance", "Maintenance"],
            ].map(([id, label]) => (
              <button
                key={id}
                className="ent-button"
                aria-pressed={selected === id}
                onClick={() => setTab(id!)}
              >
                {label}
              </button>
            ))}
          </div>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>
                {selected === "exception"
                  ? "Exception approvals"
                  : selected === "review"
                    ? "Evidence sign-offs"
                    : selected === "annotation"
                      ? "Investigation notes"
                      : "Maintenance windows"}
              </h2>
              {((selected === "review" && review) ||
                (["exception", "annotation"].includes(selected) &&
                  investigate) ||
                (selected === "maintenance" && manage)) &&
                formButton(
                  selected,
                  selected === "review"
                    ? "Sign off evidence"
                    : selected === "exception"
                      ? "Request exception"
                      : "Add record",
                )}
            </header>
            {recordsOf(selected).length ? (
              table(recordsOf(selected), (row) => (
                <>
                  {selected === "exception" &&
                    row.status === "pending" &&
                    approve && (
                      <>
                        <button
                          className="ent-button"
                          onClick={() => perform(() => action(row, "approve"))}
                        >
                          Approve
                        </button>
                        <button
                          className="ent-button"
                          onClick={() => perform(() => action(row, "reject"))}
                        >
                          Reject
                        </button>
                      </>
                    )}
                </>
              ))
            ) : (
              <Empty title="No audit records yet">
                Capture a review, an exception, or an investigation note.
                Sign-offs reference a specific snapshot, and exceptions require
                a separate approver.
              </Empty>
            )}
          </section>
        </>
      );
    }
    if (view === "reports")
      return (
        <>
          <div className="ent-tabs">
            <button
              className="ent-button"
              aria-pressed={tab !== "schedule"}
              onClick={() => setTab("report")}
            >
              Report library
            </button>
            <button
              className="ent-button"
              aria-pressed={tab === "schedule"}
              onClick={() => setTab("schedule")}
            >
              Schedules
            </button>
          </div>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>
                {tab === "schedule"
                  ? "Automatic reporting"
                  : activeTenant
                    ? `${activeTenant.branding.companyName ?? activeTenant.name} report portal`
                    : "Private report library"}
              </h2>
              {tab === "schedule" ? (
                manage && formButton("schedule", "Add schedule")
              ) : (
                <button
                  className="ent-button primary"
                  disabled={
                    !recordsOf("snapshot").some((r) =>
                      ["complete", "partial"].includes(r.status),
                    )
                  }
                  onClick={() => setModal("report")}
                >
                  <Plus size={14} />
                  Generate report
                </button>
              )}
            </header>
            {recordsOf(tab === "schedule" ? "schedule" : "report").length ? (
              table(
                recordsOf(tab === "schedule" ? "schedule" : "report"),
                (row) =>
                  row.kind === "report" ? (
                    <button
                      className="ent-button"
                      onClick={() => perform(() => download(row))}
                    >
                      <Download size={13} />
                      {String(row.data.format).toUpperCase()}
                    </button>
                  ) : manage && row.status === "active" ? (
                    <button
                      className="ent-button"
                      onClick={() => perform(() => action(row, "archive"))}
                    >
                      Stop schedule
                    </button>
                  ) : null,
              )
            ) : (
              <Empty
                title={
                  tab === "schedule"
                    ? "Set a reporting rhythm"
                    : "Your report library is ready"
                }
              >
                {tab === "schedule"
                  ? "Deliver daily, weekly, monthly, or quarterly documentation links in your local timezone."
                  : "Generate full documentation or an executive summary from a captured snapshot. All downloads require current workspace access."}
              </Empty>
            )}
          </section>
          {jobCard()}
        </>
      );
    if (view === "team")
      return (
        <>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>Workspace members</h2>
              {formButton("invite", "Invite member")}
            </header>
            <div className="ent-table-wrap">
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>Member identity</th>
                    <th>Role</th>
                    <th>Customer access</th>
                    <th>Expiry</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((m) => (
                    <tr key={m.user_id}>
                      <td>
                        {m.display_name ?? m.user_id}
                        <small>
                          {m.user_id === member?.user_id ? "You" : m.user_id}
                        </small>
                      </td>
                      <td>
                        <Badge value={m.role as string} />
                      </td>
                      <td>
                        {m.customer_scope === null
                          ? "All customers"
                          : `${(m.customer_scope as string[]).length} assigned`}
                      </td>
                      <td>
                        {m.expires_at ? (
                          <DateLabel value={m.expires_at as string} />
                        ) : (
                          "No expiry"
                        )}
                      </td>
                      <td>
                        <button
                          className="ent-button"
                          onClick={() => setEditMember(m)}
                        >
                          Edit access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="ent-card" style={{ marginTop: 22 }}>
            <header className="ent-card-head">
              <h2>Invitations</h2>
            </header>
            {team.invitations.length ? (
              <div className="ent-table-wrap">
                <table className="ent-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.invitations.map((i) => (
                      <tr key={i.id}>
                        <td>{i.email}</td>
                        <td>{i.role}</td>
                        <td>
                          <Badge
                            value={
                              i.accepted_at
                                ? "accepted"
                                : i.revoked_at
                                  ? "revoked"
                                  : Date.parse(i.expires_at as string) <
                                      Date.now()
                                    ? "expired"
                                    : "pending"
                            }
                          />
                        </td>
                        <td>
                          <DateLabel value={i.expires_at as string} />
                          {!i.accepted_at && !i.revoked_at && (
                            <button
                              className="ent-button"
                              onClick={() =>
                                perform(async () => {
                                  await api(
                                    `${base}/invitations/${String(i.id)}`,
                                    {},
                                  );
                                  refresh();
                                })
                              }
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="Invite the people you work with">
                Assign a role and customer scope. Sharing a company domain never
                grants automatic access.
              </Empty>
            )}
          </section>
        </>
      );
    if (view === "integrations")
      return (
        <>
          <div className="ent-actions" style={{ marginBottom: 18 }}>
            {formButton("api_key", "Create API credential")}
            <button className="ent-button" onClick={() => setModal("webhook")}>
              <Plus size={14} />
              Add webhook
            </button>
            <button
              className="ent-button"
              onClick={() => setModal("alert_route")}
            >
              <Mail size={14} />
              Email alerts
            </button>
          </div>
          <section className="ent-card">
            <header className="ent-card-head">
              <h2>Customer-scoped integrations</h2>
            </header>
            {rows.length ? (
              table(rows, (row) =>
                row.status === "active" ? (
                  <button
                    className="ent-button danger"
                    onClick={() => perform(() => action(row, "archive"))}
                  >
                    Revoke
                  </button>
                ) : null,
              )
            ) : (
              <Empty title="Connect your own workflow">
                Use the read-only API or receive signed events. Credentials and
                endpoints are restricted to one customer.
              </Empty>
            )}
          </section>
          <section className="ent-card" style={{ marginTop: 22 }}>
            <div className="ent-card-body">
              <h3>Read-only API</h3>
              <p className="ent-footer-note">
                Send Authorization: Bearer YOUR_KEY. Available resources:
                snapshot, finding, report. Limit: 60 requests per minute per
                credential.
              </p>
              <pre className="ent-code" style={{ marginTop: 15 }}>
                GET /api/enterprise/external/snapshot{"\n"}GET
                /api/enterprise/external/snapshot/RECORD_ID{"\n"}GET
                /api/enterprise/external/finding
              </pre>
              <p className="ent-footer-note">
                Webhook signatures: HMAC SHA-256 over id.timestamp.rawBody, sent
                as v1=hex. Deduplicate Webhook-Id and reject stale
                Webhook-Timestamp values.
              </p>
            </div>
          </section>
        </>
      );
    if (view === "billing")
      return (
        detail && (
          <Billing
            key={workspace}
            detail={detail}
            busy={busy}
            submit={(data) =>
              perform(async () => {
                const result = await api(`${base}/billing`, data);
                if (result.url) location.assign(result.url as string);
                else {
                  setNotice(result.message as string);
                  refresh();
                }
              })
            }
          />
        )
      );
    return (
      <section className="ent-card">
        <header className="ent-card-head">
          <h2>Workspace activity</h2>
          <small>Latest 100 actions</small>
        </header>
        {events.length ? (
          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Customer</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.action}</td>
                    <td>{event.actor_id ?? "Background service"}</td>
                    <td>
                      {detail?.tenants.find((t) => t.id === event.customer_id)
                        ?.name ?? "Workspace"}
                    </td>
                    <td>
                      <DateLabel value={event.created_at as string} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No recorded activity">
            Workspace actions will appear here as your team starts working.
          </Empty>
        )}
      </section>
    );
  };
  function tenantTable(actions = false) {
    return filteredTenants.length ? (
      <div className="ent-table-wrap">
        <table className="ent-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Connection</th>
              <th>Last collection</th>
              {actions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredTenants.map((t) => (
              <tr key={t.id}>
                <td>
                  <div className="ent-customer-name">
                    <span className="ent-customer-mark">
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <button
                        className="ent-icon"
                        style={{ textAlign: "left", padding: 0 }}
                        onClick={() => {
                          setCustomer(t.id);
                          navigate("reports");
                        }}
                      >
                        {t.name}
                      </button>
                      <small>
                        {t.kind}
                        {actions ? ` · ${t.tenant_id}` : ""}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge value={t.status} />
                  {t.health && <small>{t.health}</small>}
                </td>
                <td>
                  <DateLabel value={t.last_collected_at} />
                </td>
                {actions && (
                  <td>
                    <div className="ent-actions">
                      {manage && t.status !== "connected" && (
                        <button
                          className="ent-button"
                          onClick={() =>
                            perform(async () => {
                              const result = await api(
                                `${base}/consent/${t.id}`,
                                {},
                              );
                              setSecret(result.url as string);
                            })
                          }
                        >
                          Get consent link
                        </button>
                      )}
                      {investigate && t.status === "connected" && (
                        <button
                          className="ent-button"
                          onClick={() =>
                            perform(async () => {
                              await api(`${base}/tenants/${t.id}`, {
                                action: "refresh",
                              });
                              setNotice("Collection queued.");
                              refresh();
                            })
                          }
                        >
                          <RefreshCw size={13} />
                          Collect
                        </button>
                      )}
                      {manage && t.status === "connected" && (
                        <button
                          className="ent-button"
                          onClick={() => {
                            setInspect({ disconnectTenant: t });
                          }}
                        >
                          Disconnect
                        </button>
                      )}
                      {manage && (
                        <button
                          className="ent-button"
                          onClick={() => setInspect({ brandingTenant: t })}
                        >
                          Branding
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="Connect your first tenant">
        Purchase or start a trial, then add a tenant and share its consent link
        with the customer administrator.
      </Empty>
    );
  }
  function jobCard() {
    return jobs.length ? (
      <section className="ent-card" style={{ marginTop: 22 }}>
        <header className="ent-card-head">
          <h2>Background jobs</h2>
          <small>Updates every 15 seconds while active</small>
        </header>
        <div className="ent-table-wrap">
          <table className="ent-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Requested</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 12).map((j) => (
                <tr key={j.id}>
                  <td>
                    {j.kind}
                    {j.error && <small>{j.error}</small>}
                  </td>
                  <td>
                    {detail?.tenants.find((t) => t.id === j.customer_id)?.name}
                  </td>
                  <td>
                    <Badge value={j.status as string} />
                  </td>
                  <td>
                    {j.attempts}
                    {j.status === "failed" && investigate && (
                      <button
                        className="ent-button"
                        onClick={() =>
                          perform(async () => {
                            await api(`${base}/jobs/${String(j.id)}`, {
                              customerId: j.customer_id,
                            });
                            setNotice("Job queued for retry.");
                            refresh();
                          })
                        }
                      >
                        Retry
                      </button>
                    )}
                  </td>
                  <td>
                    <DateLabel value={j.created_at as string} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : null;
  }
  if (phase !== "ready")
    return (
      <div className="enterprise ent-login">
        <section className="ent-login-story">
          <Link className="ent-brand" href="/">
            <ShieldCheck size={27} />
            <span>
              Intune Documentation<small>Enterprise & MSP</small>
            </span>
          </Link>
          <div>
            <p className="ent-eyebrow">Your configuration. In context.</p>
            <h1>
              Know what changed.
              <br />
              Show what matters.
            </h1>
            <p>
              One private workspace for configuration history, clear evidence,
              and every customer you look after.
            </p>
          </div>
          <div className="ent-actions">
            <span className="ent-badge">Read-only by design</span>
            <span className="ent-badge">Encrypted EU history</span>
            <span className="ent-badge">Microsoft business identity</span>
          </div>
        </section>
        <section className="ent-login-form">
          <p className="ent-eyebrow">Welcome to your workspace</p>
          <h2>Sign in to get the full picture.</h2>
          <p>
            Use your Microsoft work account. Your organization&apos;s identity
            confirms who you are; an invitation determines what you can access.
          </p>
          {error && (
            <div className="ent-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="ent-button primary"
            disabled={busy || phase === "loading"}
            onClick={() => perform(() => signIn(connection?.tenant))}
          >
            <Building2 size={17} />
            {phase === "loading"
              ? "Checking sign-in…"
              : "Continue with Microsoft"}
          </button>
          <p className="ent-footer-note">
            No password to create. Personal Microsoft accounts are not
            supported. If you were invited, sign in and verify your invited
            mailbox.
          </p>
          <div className="ent-actions">
            <a className="ent-button quiet" href="/sign-in">
              Continue with free Hobby
              <ArrowUpRight size={13} />
            </a>
            <Support />
          </div>
        </section>
      </div>
    );
  return (
    <div
      className="enterprise"
      style={
        activeTenant?.branding.primaryColor
          ? ({ "--green": activeTenant.branding.primaryColor } as CSSProperties)
          : undefined
      }
    >
      <div className="ent-shell">
        <aside className="ent-sidebar">
          <Link className="ent-brand" href="/">
            <ShieldCheck size={25} />
            <span>
              Intune Documentation<small>Workspace</small>
            </span>
          </Link>
          <div>
            <label className="sr-only" htmlFor="workspace-switch">
              Workspace
            </label>
            <select
              id="workspace-switch"
              className="ent-workspace"
              value={workspace}
              onChange={(e) => {
                setWorkspace(e.target.value);
                setCustomer("");
                setDetail(null);
                navigate("overview");
              }}
            >
              <option value="" disabled>
                Select workspace
              </option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              className="ent-icon"
              style={{ fontSize: 11, marginTop: 6 }}
              onClick={() => setModal("workspace")}
            >
              <Plus size={13} />
              New workspace
            </button>
          </div>
          <nav aria-label="Workspace navigation">
            {nav
              .filter(
                (n) =>
                  (!n.owner || member?.role === "owner") &&
                  (!n.manage ||
                    (manage &&
                      (n.id !== "team" || member?.customer_scope === null))),
              )
              .map((n) => (
                <button
                  key={n.id}
                  aria-current={view === n.id ? "page" : undefined}
                  onClick={() => navigate(n.id)}
                >
                  <n.icon size={16} strokeWidth={1.7} />
                  {n.label}
                </button>
              ))}
          </nav>
          <div className="ent-sidebar-footer">
            <a href="mailto:support@ugurlabs.com">
              <Mail size={13} style={{ display: "inline", marginRight: 7 }} />
              Priority email support
            </a>
            <a href="/dashboard">
              Open Hobby
              <ArrowUpRight
                size={12}
                style={{ display: "inline", marginLeft: 7 }}
              />
            </a>
            <small>{name}</small>
            <button className="ent-icon" onClick={() => perform(signOut)}>
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </aside>
        <main className="ent-main">
          <header className="ent-topbar">
            <span>
              {detail?.workspace.plan === "msp"
                ? "MSP operations"
                : "Enterprise workspace"}
              <ChevronRight
                size={12}
                style={{ display: "inline", margin: "0 9px" }}
              />
              {nav.find((n) => n.id === view)?.label}
            </span>
            <div className="ent-actions">
              <label className="sr-only" htmlFor="customer-switch">
                Customer scope
              </label>
              <select
                id="customer-switch"
                className="ent-input"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              >
                <option value="">All assigned tenants</option>
                {detail?.tenants.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                className="ent-icon"
                onClick={refresh}
                aria-label="Refresh workspace"
                disabled={loading}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </header>
          <div className="ent-content">
            {error && (
              <div className="ent-error" role="alert">
                {error}
                <button
                  className="ent-icon"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="ent-notice" role="status">
                {notice}
                <button
                  className="ent-icon"
                  onClick={() => setNotice("")}
                  aria-label="Dismiss notification"
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {connection && (
              <section className="ent-card" style={{ marginBottom: 24 }}>
                <div className="ent-card-body">
                  <h2>Authorize customer monitoring</h2>
                  <p>
                    <strong>
                      {connection.workspace_name ??
                        "Loading requesting workspace…"}
                    </strong>{" "}
                    requests access to{" "}
                    {connection.customer_name ?? connection.tenant}. Requested
                    by{" "}
                    {connection.requested_by ?? "the workspace administrator"}.
                  </p>
                  <p style={{ margin: "14px 0" }}>
                    Confirm read-only collection and encrypted EU history for
                    tenant <code>{connection.tenant}</code>. You must sign in as
                    an active Global Administrator or Privileged Role
                    Administrator in that customer tenant. This does not grant
                    workspace membership.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void perform(async () => {
                        await api(
                          "connection-approval",
                          { token: connection.token, acknowledged: true },
                          false,
                          true,
                        );
                        sessionStorage.removeItem("enterprise.connection");
                        setConnection(null);
                        setNotice(
                          "Customer authorization complete. The requesting workspace can now start monitoring.",
                        );
                        refresh();
                      });
                    }}
                  >
                    <label className="ent-check">
                      <input type="checkbox" required />I approve this workspace
                      connection and up to 12 months of encrypted configuration
                      history.
                    </label>
                    <div className="ent-actions">
                      <button
                        className="ent-button primary"
                        disabled={busy || !connection.workspace_name}
                      >
                        Approve customer connection
                      </button>
                      <button
                        className="ent-button"
                        type="button"
                        onClick={() => perform(() => signIn(connection.tenant))}
                      >
                        Sign in to the customer tenant
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            )}
            {inviteToken && (
              <section className="ent-card" style={{ marginBottom: 24 }}>
                <div className="ent-card-body">
                  <h2>You have a team invitation</h2>
                  <p style={{ margin: "10px 0 18px", color: "var(--muted)" }}>
                    Verify control of the invited mailbox to link this Microsoft
                    identity to your team membership.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const code =
                        (new FormData(e.currentTarget).get("code") as
                          | string
                          | null) ?? "";
                      void perform(async () => {
                        const result = await api("invitations", {
                          token: inviteToken,
                          ...(verification ? { code } : {}),
                        });
                        if (result.verificationRequired) setVerification(true);
                        else {
                          sessionStorage.removeItem("enterprise.invitation");
                          setInviteToken("");
                          await loadWorkspaces();
                          setWorkspace(result.workspaceId as string);
                          setNotice("Invitation accepted.");
                          refresh();
                        }
                      });
                    }}
                  >
                    {verification && (
                      <Field label="Verification code">
                        <input
                          name="code"
                          inputMode="numeric"
                          pattern="[0-9]{8}"
                          autoComplete="one-time-code"
                          required
                        />
                      </Field>
                    )}
                    <button className="ent-button primary" disabled={busy}>
                      {verification
                        ? "Accept invitation"
                        : "Send verification code"}
                    </button>
                  </form>
                </div>
              </section>
            )}
            {workspace ? (
              <>
                <div className="ent-title">
                  <div>
                    <p className="ent-eyebrow">
                      {activeTenant?.name ??
                        detail?.workspace.name ??
                        "Workspace"}
                    </p>
                    <h1>
                      {view === "overview"
                        ? "Your configuration, in context."
                        : nav.find((n) => n.id === view)?.label}
                    </h1>
                    <p>{descriptions[view]}</p>
                  </div>
                  {view === "overview" && manage && (
                    <button
                      className="ent-button primary"
                      onClick={() => navigate("customers")}
                    >
                      Manage tenants
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                {kindMap[view] && view !== "overview" && (
                  <Field label="Search record names or evidence IDs">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search retained records…"
                    />
                  </Field>
                )}
                {loading ? (
                  <div
                    className="ent-stack"
                    role="status"
                    aria-label="Loading workspace"
                  >
                    <div className="ent-skeleton" />
                    <div className="ent-skeleton" />
                  </div>
                ) : detail ? (
                  content()
                ) : null}
                {!loading &&
                  Object.entries(cursors).some(([, cursor]) => cursor) && (
                    <div className="ent-actions" style={{ marginTop: 20 }}>
                      {Object.entries(cursors)
                        .filter(([, cursor]) => cursor)
                        .map(([kind, cursor]) => (
                          <button
                            key={kind}
                            className="ent-button"
                            disabled={busy}
                            onClick={() =>
                              perform(async () => {
                                const result = await api<{
                                  records: Row[];
                                  nextCursor: string | null;
                                }>(
                                  `${base}/records?kind=${kind}&before=${encodeURIComponent(cursor!)}&q=${encodeURIComponent(query)}${customer ? `&customer=${customer}` : ""}`,
                                );
                                setRows((old) => [...old, ...result.records]);
                                setCursors((old) => ({
                                  ...old,
                                  [kind]: result.nextCursor,
                                }));
                              })
                            }
                          >
                            Load older {kind} records
                          </button>
                        ))}
                    </div>
                  )}
                <p className="ent-footer-note">
                  Configuration evidence, not certification or effective device
                  compliance. All customer Microsoft operations are read-only.
                  Support:{" "}
                  <a href="mailto:support@ugurlabs.com">support@ugurlabs.com</a>
                  .
                </p>
              </>
            ) : (
              <section className="ent-card">
                <Empty title="A workspace for your team">
                  Create a workspace to get started, or ask your administrator
                  for an invitation. Signing in with the same company domain
                  does not grant access.
                </Empty>
                <div
                  className="ent-actions"
                  style={{ justifyContent: "center", paddingBottom: 35 }}
                >
                  {formButton("workspace", "Create workspace")}
                  <Support />
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
      {modal && !["compare", "report"].includes(modal) && (
        <Modal
          title={
            modal === "workspace"
              ? "Create workspace"
              : modal === "tenant"
                ? "Add customer tenants"
                : modal === "invite"
                  ? "Invite team member"
                  : `Create ${modal.replaceAll("_", " ")}`
          }
          close={() => setModal("")}
        >
          <CreateForm
            kind={modal}
            workspace={workspace}
            customer={customer}
            tenants={detail?.tenants ?? []}
            plan={detail?.workspace.plan ?? "enterprise"}
            busy={busy}
            close={() => setModal("")}
            submit={async (data) => {
              setBusy(true);
              try {
                await create(data);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
      {modal === "compare" && (
        <Modal
          title="Compare captured configurations"
          close={() => setModal("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                left = rows.find((r) => r.id === form.get("before"))!;
              void perform(async () => {
                const result = await api(`${base}/records/${left.id}`, {
                  action: "compare",
                  customerId: left.customer_id,
                  otherId: form.get("after"),
                });
                setModal("");
                setInspect(result);
              });
            }}
          >
            {["before", "after"].map((key) => (
              <Field
                key={key}
                label={key === "before" ? "Earlier snapshot" : "Later snapshot"}
              >
                <select name={key} required>
                  {recordsOf("snapshot").map((r) => (
                    <option key={r.id} value={r.id}>
                      {
                        detail?.tenants.find((t) => t.id === r.customer_id)
                          ?.name
                      }{" "}
                      · {new Date(r.created_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <p className="ent-footer-note">
              Choose snapshots from the same customer. Failed or absent sections
              are excluded from change claims.
            </p>
            <footer>
              <button className="ent-button primary" disabled={busy}>
                Compare
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal === "report" && (
        <Modal title="Generate a report" close={() => setModal("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                snapshot = rows.find((r) => r.id === form.get("snapshot"))!;
              void perform(async () => {
                await api(`${base}/report`, {
                  snapshotId: snapshot.id,
                  customerId: snapshot.customer_id,
                  format: form.get("format"),
                  template: form.get("template"),
                });
                setModal("");
                setNotice(
                  "Report queued. It will appear in the library when ready.",
                );
                refresh();
              });
            }}
          >
            <Field label="Captured evidence">
              <select name="snapshot">
                {recordsOf("snapshot")
                  .filter((r) => ["complete", "partial"].includes(r.status))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {
                        detail?.tenants.find((t) => t.id === r.customer_id)
                          ?.name
                      }{" "}
                      · {new Date(r.created_at).toLocaleString()} · {r.status}
                    </option>
                  ))}
              </select>
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
            <footer>
              <button className="ent-button primary" disabled={busy}>
                Generate report
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal
          title={
            secret.startsWith("https:")
              ? "Customer consent link"
              : "Copy your integration secret"
          }
          close={() => setSecret("")}
        >
          <div className="ent-card-body">
            <p>
              {secret.startsWith("https:")
                ? "Share this link with the customer administrator. It expires in one hour and grants no workspace membership."
                : "This secret is shown once. Store it securely before closing this dialog."}
            </p>
            <pre className="ent-code" style={{ margin: "18px 0" }}>
              {secret}
            </pre>
            <button
              className="ent-button"
              onClick={() =>
                perform(async () => {
                  await navigator.clipboard.writeText(secret);
                  setNotice("Copied to clipboard.");
                })
              }
            >
              Copy
            </button>
          </div>
        </Modal>
      )}
      {inspect && (
        <Modal
          title={
            inspect.disconnectTenant
              ? "Disconnect tenant"
              : inspect.brandingTenant
                ? "Customer branding"
                : inspect.changes
                  ? "Configuration comparison"
                  : "Evidence detail"
          }
          close={() => setInspect(null)}
        >
          {inspect.disconnectTenant ? (
            <div className="ent-card-body">
              <p>
                Stop background collection for {inspect.disconnectTenant.name}.
                Existing retained evidence stays available. Revoke application
                consent separately in Microsoft Entra if required.
              </p>
              <div className="ent-actions" style={{ marginTop: 20 }}>
                <button
                  className="ent-button danger"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await api(
                        `${base}/tenants/${String(inspect.disconnectTenant.id)}`,
                        { action: "disconnect" },
                      );
                      setInspect(null);
                      refresh();
                    })
                  }
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : inspect.brandingTenant ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void perform(async () => {
                  await api(
                    `${base}/tenants/${String(inspect.brandingTenant.id)}`,
                    {
                      action: "branding",
                      name: data.get("name"),
                      color: data.get("color"),
                    },
                  );
                  setInspect(null);
                  refresh();
                });
              }}
            >
              <Field label="Customer-facing name">
                <input
                  name="name"
                  defaultValue={
                    inspect.brandingTenant.branding.companyName ??
                    inspect.brandingTenant.name
                  }
                  required
                />
              </Field>
              <Field label="Brand color">
                <input
                  name="color"
                  type="color"
                  defaultValue={
                    inspect.brandingTenant.branding.primaryColor ?? "#136c55"
                  }
                />
              </Field>
              <footer>
                <button className="ent-button primary" disabled={busy}>
                  Save branding
                </button>
              </footer>
            </form>
          ) : (
            <div className="ent-card-body">
              {inspect.id && (
                <p>
                  <strong>Evidence ID</strong>
                  <br />
                  <code>{inspect.id}</code>
                </p>
              )}
              {inspect.changes && (
                <p>
                  {inspect.changes.length} changes · {inspect.skipped.length}{" "}
                  sections excluded because evidence was incomplete
                </p>
              )}
              <pre className="ent-code" style={{ marginTop: 18 }}>
                {JSON.stringify(inspect.content ?? inspect, null, 2)}
              </pre>
            </div>
          )}
        </Modal>
      )}
      {editMember && (
        <Modal title="Update member access" close={() => setEditMember(null)}>
          <MemberForm
            tenants={detail?.tenants ?? []}
            member={editMember}
            busy={busy}
            close={() => setEditMember(null)}
            submit={(data) =>
              perform(async () => {
                await api(`${base}/team/${String(editMember.user_id)}`, data);
                setEditMember(null);
                refresh();
              })
            }
          />
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="ent-card ent-stat">
      <div className="ent-label">
        {label}
        {icon}
      </div>
      <strong>{value.toLocaleString()}</strong>
      <small>{note}</small>
    </div>
  );
}
function Billing({
  detail,
  busy,
  submit,
}: {
  detail: Detail;
  busy: boolean;
  submit: (data: unknown) => Promise<void>;
}) {
  const plan = detail.workspace.plan,
    sub = detail.subscription,
    [interval, setInterval] = useState<"month" | "year">(sub.interval),
    [quantity, setQuantity] = useState(
      Math.max(sub.quantity, plan === "msp" ? 10 : 1),
    ),
    [founders, setFounders] = useState(
      sub.status !== "pending"
        ? Boolean(
            ["active", "trialing"].includes(sub.status) &&
              sub.founders_at &&
              sub.discount_ends_at &&
              Date.parse(sub.discount_ends_at) > Date.now(),
          )
        : Date.now() < Date.parse(FOUNDERS_END),
    ),
    [confirmed, setConfirmed] = useState(false);
  const [useTrial, setUseTrial] = useState(!sub.provider_id);
  const terminated = Boolean(
    sub.provider_id &&
      !["active", "trialing", "past_due"].includes(sub.status) &&
      sub.paid_through &&
      Date.parse(sub.paid_through) < Date.now(),
  );
  const active = sub.status !== "pending" && !terminated,
    quote = price(
      plan,
      Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= 10000
        ? quantity
        : 0,
      interval,
      founders && interval === "month",
    );
  return (
    <div className="ent-split" style={{ marginTop: 0 }}>
      <section className="ent-card">
        <header className="ent-card-head">
          <h2>{plan === "msp" ? "MSP" : "Enterprise"}</h2>
          <Badge value={sub.status} />
        </header>
        <div className="ent-card-body">
          {active ? (
            <>
              <p>
                Purchased capacity:{" "}
                <strong>
                  {sub.quantity}{" "}
                  {plan === "msp" ? "customers" : "production tenants"}
                </strong>
                , plus one {plan === "msp" ? "internal" : "test"} tenant.
              </p>
              <p style={{ marginTop: 12 }}>
                Current period ends:{" "}
                <DateLabel value={sub.trial_ends_at ?? sub.paid_through} />
              </p>
              {sub.cancel_at_period_end && (
                <p className="ent-notice" style={{ marginTop: 15 }}>
                  Cancellation is scheduled for the end of this period.
                </p>
              )}
              <div className="ent-actions" style={{ marginTop: 20 }}>
                <button
                  className="ent-button primary"
                  disabled={busy}
                  onClick={() => submit({ action: "portal" })}
                >
                  Invoices & subscription
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <Field
                label="Purchased tenant capacity"
                hint="Disconnect tenants before reducing capacity. Quantity changes are prorated by Polar."
              >
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </Field>
              <p className="ent-price">
                ${(quote.cents / 100).toFixed(2)}
                <small> / {interval}</small>
              </p>
              <p className="ent-footer-note">
                Recurring total at the selected capacity, before tax. Polar
                calculates any proration.{" "}
                {founders ? "Your current founders discount is included." : ""}
              </p>
              <label className="ent-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I authorize the displayed capacity change and applicable
                proration.
              </label>
              <button
                className="ent-button"
                disabled={busy || !confirmed || quantity === sub.quantity}
                onClick={() => submit({ action: "quantity", quantity })}
              >
                Update capacity
              </button>
            </>
          ) : (
            <>
              <div className="ent-tabs">
                <button
                  className="ent-button"
                  aria-pressed={interval === "month"}
                  onClick={() => setInterval("month")}
                >
                  Monthly
                </button>
                <button
                  className="ent-button"
                  aria-pressed={interval === "year"}
                  onClick={() => {
                    setInterval("year");
                    setFounders(false);
                  }}
                >
                  Annual · Save 15%
                </button>
              </div>
              <Field
                label={
                  plan === "msp"
                    ? "Customer capacity"
                    : "Production tenant capacity"
                }
              >
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </Field>
              {Date.now() < Date.parse(FOUNDERS_END) &&
                interval === "month" &&
                !sub.founders_at && (
                  <label className="ent-check">
                    <input
                      type="checkbox"
                      checked={founders}
                      onChange={(e) => setFounders(e.target.checked)}
                    />
                    Founders: 50% off for 12 months. No stacking.
                  </label>
                )}
              <p className="ent-price">
                $
                {(quote.cents / 100).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
                <small> / {interval}</small>
              </p>
              <p className="ent-footer-note">
                USD, excluding applicable taxes. Includes {quote.included}{" "}
                {plan === "msp" ? "customers" : "production tenant"} and one{" "}
                {plan === "msp" ? "internal" : "test"} tenant. {quote.extras}{" "}
                additional tenants in this quote.
              </p>
              {founders && interval === "month" && (
                <p className="ent-footer-note">
                  After 12 discounted months: $
                  {(
                    price(
                      plan,
                      Math.max(
                        0,
                        Math.min(
                          10000,
                          Number.isSafeInteger(quantity) ? quantity : 0,
                        ),
                      ),
                      "month",
                    ).cents / 100
                  ).toFixed(2)}
                  /month at this capacity. Enrollment ends 1 November 2026,
                  00:00 Berlin.
                </p>
              )}
              {!sub.provider_id && (
                <label className="ent-check">
                  <input
                    type="checkbox"
                    checked={useTrial}
                    onChange={(e) => setUseTrial(e.target.checked)}
                  />
                  Include a 30-day trial (one per creator and customer tenant)
                </label>
              )}
              <label className="ent-check" style={{ marginTop: 20 }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {useTrial && !sub.provider_id
                  ? "I understand the 30-day trial starts at checkout and automatically becomes a paid subscription unless canceled."
                  : "I understand this subscription starts with payment at checkout."}{" "}
                Final tax and billing details are shown by Polar.
              </label>
              <button
                className="ent-button primary"
                disabled={
                  busy ||
                  !confirmed ||
                  quantity < 1 ||
                  !Number.isInteger(quantity)
                }
                onClick={() =>
                  submit({
                    action: "checkout",
                    interval,
                    quantity,
                    founders: founders && interval === "month",
                    trial: useTrial && !sub.provider_id,
                  })
                }
              >
                {useTrial && !sub.provider_id
                  ? "Start 30-day trial"
                  : "Continue to checkout"}
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </section>
      <section className="ent-card">
        <div className="ent-card-body">
          <p className="ent-eyebrow">Included in your paid workspace</p>
          <h2>Everything your team needs to document change.</h2>
          <ul className="ent-feature-list">
            {[
              "Unlimited invited team members",
              "Daily read-only collection",
              "12 months of encrypted EU history",
              "Setting and assignment comparisons",
              "Approved baselines and drift findings",
              "Custom standards and exception approvals",
              "Audit evidence and reviewer sign-offs",
              "Scheduled PDF, Word, and executive reports",
              ...(plan === "msp"
                ? [
                    "Customer portfolio and branded report portals",
                    "Quarterly customer review packs",
                  ]
                : []),
              "Customer-scoped API and signed webhooks",
              "Priority support by email",
            ].map((item) => (
              <li key={item}>
                <Check size={15} />
                {item}
              </li>
            ))}
          </ul>
          <Support />
          <p className="ent-footer-note">
            Ugurlabs UG (haftungsbeschränkt)
            <br />
            Fährstraße 217, 40221 Düsseldorf, Germany
            <br />
            HRB 113979, Amtsgericht Düsseldorf
            <br />
            Managing Director: Ugur Koc
          </p>
          <p className="ent-footer-note">
            Checkout and payment administration are provided by Polar. Hobby
            remains free with all existing features.
          </p>
        </div>
      </section>
    </div>
  );
}
