import { ListFilter, Wrench, X } from "lucide-react";
import { useState } from "react";
import type { FixAction, FixActionKind, FixPlan as Plan } from "../../../../../../src/lib/benchmarks/fix-plan";
import { Button } from "../ui/Button";
import { DisclosureSummary } from "../ui/DisclosureSummary";

// Steps shown before "Show all".
export const STEPS_SHOWN = 5;
// The list filter for results the plan has no step for.
export const WITHOUT_STEP = "withoutStep";

export const ACTION_LABELS: Readonly<Record<FixActionKind, string>> = {
  changeValue: "Change values",
  assignPolicy: "Assign a policy",
  changeBeforeAssign: "Change before assigning",
  checkOtherProfiles: "Check other profile types",
  checkValue: "Check values",
  checkAssignment: "Check assignments",
  collectAgain: "Collect again",
  checkPackValue: "Check pack values",
  chooseValue: "Choose a value",
  addSetting: "Add missing settings",
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

// The step number of an action in the plan, for the list's filter label.
export function stepLabel(plan: Plan, id: string): string | null {
  if (id === WITHOUT_STEP) return "results without a step";
  const index = plan.actions.findIndex((action) => action.id === id);
  return index < 0 ? null : `Step ${index + 1}: ${ACTION_LABELS[plan.actions[index]!.kind]}`;
}

// A setting compared at two Levels with one value is one line.
const distinct = (settings: FixAction["settings"]) =>
  settings.filter((setting, index) => settings.findIndex((other) => other.text === setting.text) === index);

function Step({
  action,
  number,
  active,
  onShow,
}: {
  action: FixAction;
  number: number;
  active: boolean;
  onShow: () => void;
}) {
  const results = action.results.length;
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0 @xl:gap-4">
      <span
        className="bg-petrol-950 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white tabular-nums"
        aria-hidden="true"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-petrol-600 text-[11px] font-bold tracking-[0.14em] uppercase">
              <span className="sr-only">Step {number}: </span>
              {ACTION_LABELS[action.kind]}
              <span className="text-petrol-600 font-semibold tracking-normal normal-case">
                {" "}
                &middot; {plural(results, "result", "results")}
              </span>
            </p>
            <p className="text-petrol-950 mt-1 max-w-3xl text-[13px] leading-5 font-semibold break-words">{action.text}</p>
          </div>
          <Button
            size="sm"
            variant={active ? "primary" : "secondary"}
            icon={ListFilter}
            aria-pressed={active}
            aria-label={`Show the ${plural(results, "result", "results")} of step ${number} in the list`}
            onClick={onShow}
          >
            {active ? "Shown in the list" : `Show ${plural(results, "result", "results")}`}
          </Button>
        </div>
        {/* What the engine's simulation shows assigning the policy as it is would break, to do first. */}
        {action.conditions && action.conditions.length > 0 && (
          <div className="mt-2 max-w-3xl rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs">
            <p className="font-semibold text-amber-900">Before assigning it</p>
            <ul className="mt-1 space-y-1" aria-label={`Before assigning the policy of step ${number}`}>
              {distinct(action.conditions).map((setting) => (
                <li key={`${setting.findingKey}:${setting.settingId}`} className="leading-5 break-words text-amber-950">
                  {setting.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {action.settings.length > 0 && (
          <details className="text-petrol-700 mt-2 text-xs">
            <DisclosureSummary className="font-semibold hover:text-teal-700">
              {plural(new Set(action.settings.map((setting) => setting.settingId)).size, "setting", "settings")}
            </DisclosureSummary>
            <ul className="border-petrol-950/6 mt-2 max-h-72 space-y-2 overflow-y-auto border-l-2 pr-1 pl-3" aria-label={`Settings of step ${number}`}>
              {distinct(action.settings).map((setting) => (
                <li key={`${setting.findingKey}:${setting.settingId}`} className="leading-5">
                  <span className="text-petrol-800 max-w-3xl break-words">{setting.text}</span>
                  {setting.name !== setting.settingId && (
                    <span className="text-petrol-600 selectable block font-mono text-[11px] break-all">
                      {setting.settingId}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

// The engine's fix plan (buildFixPlan) at the top of the results: what to do,
// in order of impact, each step with the policy it is about and the results
// it covers. Show narrows the list below to those results.
export function FixPlan({
  plan,
  active,
  onShow,
}: {
  plan: Plan;
  // The id of the action the list is narrowed to, or null.
  active: string | null;
  onShow: (actionId: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const { actions } = plan;
  // The narrowed step stays visible when the plan is collapsed.
  const limit = all ? actions.length : Math.max(STEPS_SHOWN, actions.findIndex((action) => action.id === active) + 1);
  const shown = actions.slice(0, limit);
  return (
    <section
      aria-labelledby="benchmark-fix-plan-title"
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Wrench className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-petrol-600 text-[11px] font-bold tracking-[0.14em] uppercase">Fix plan</p>
          <h2 id="benchmark-fix-plan-title" className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
            What to do next
          </h2>
          <p className="text-petrol-600 mt-1 max-w-2xl text-xs leading-5">
            {actions.length
              ? `${plural(actions.length, "step", "steps")} in order of impact. Each names the policy and the results it covers. Nothing is written to the tenant.`
              : plan.withoutAction > 0
                ? // Results that need review with no single step (one that needs two
                  // policies assigned together), so "nothing to change" would be false.
                  `No single step covers ${plan.withoutAction === 1 ? "this result" : `these ${plan.withoutAction.toLocaleString()} results`}; see each result for what to check.`
                : "Nothing to change: no result differs, is not configured or needs review."}
          </p>
        </div>
        {active && (
          <Button size="sm" variant="ghost" icon={X} onClick={() => onShow(null)}>
            Show all results
          </Button>
        )}
      </div>
      {plan.withoutAction > 0 && (
        <div className="border-petrol-950/6 bg-surface mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
          <p className="text-petrol-700 min-w-0 flex-1 basis-64 text-xs leading-5">
            {plural(plan.withoutAction, "result has", "results have")} no step in this plan. Their rows say why.
          </p>
          <Button
            size="sm"
            variant={active === WITHOUT_STEP ? "primary" : "secondary"}
            icon={ListFilter}
            aria-pressed={active === WITHOUT_STEP}
            onClick={() => onShow(active === WITHOUT_STEP ? null : WITHOUT_STEP)}
          >
            {active === WITHOUT_STEP ? "Shown in the list" : `Show ${plural(plan.withoutAction, "result", "results")}`}
          </Button>
        </div>
      )}
      {actions.length > 0 && (
        <ol className="divide-petrol-950/6 mt-5 divide-y" aria-label="Fix plan steps">
          {shown.map((action) => {
            const number = actions.indexOf(action) + 1;
            return (
              <Step
                key={action.id}
                action={action}
                number={number}
                active={action.id === active}
                onShow={() => onShow(action.id === active ? null : action.id)}
              />
            );
          })}
        </ol>
      )}
      {actions.length > STEPS_SHOWN && (
        <div className="border-petrol-950/6 mt-4 border-t pt-4">
          <Button size="sm" variant="secondary" aria-expanded={all} onClick={() => setAll((value) => !value)}>
            {all ? `Show the first ${STEPS_SHOWN} steps` : `Show all ${actions.length.toLocaleString()} steps`}
          </Button>
        </div>
      )}
    </section>
  );
}
