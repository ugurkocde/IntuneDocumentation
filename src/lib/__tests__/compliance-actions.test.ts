import { describe, expect, it, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";

const collection = "/deviceManagement/deviceCompliancePolicies";
const parent = `${collection}/policy-id`;
const expansion =
  "scheduledActionsForRule($expand=scheduledActionConfigurations)";
const assignments = [
  { target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } },
];
const policy = {
  id: "policy-id",
  displayName: "Password requirement",
  "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
  passwordRequired: true,
};
const block = { id: "block", actionType: "block", gracePeriodHours: 24 };
const rule = {
  id: "rule",
  ruleName: "PasswordRequired",
  scheduledActionConfigurations: [block],
};
const routingError = () =>
  Object.assign(
    new Error(
      "No OData route exists that match template ~/singleton/navigation/key/navigation with http verb GET",
    ),
    { statusCode: 400 },
  );

function mockService(response: unknown, pages = new Map<string, unknown>()) {
  const service = new DetailedIntuneService("test-token") as any;
  service.retryWithBackoff = (action: () => Promise<unknown>) => action();
  const requests: { url: string; version?: string; expand?: string }[] = [];
  service.client = {
    api: vi.fn((url: string) => {
      const recorded: (typeof requests)[number] = { url };
      requests.push(recorded);
      const request: any = {
        version: (version: string) => {
          recorded.version = version;
          return request;
        },
        top: () => request,
        expand: (expand: string) => {
          recorded.expand = expand;
          return request;
        },
        get: async () => {
          // Reproduce the reported backend rejection if the old route is used.
          if (url.endsWith("/scheduledActionsForRule")) throw routingError();
          if (url === collection) return { value: [policy] };
          if (url === `${collection}('policy-id')/assignments`)
            return { value: assignments };
          const result = url === parent ? response : pages.get(url);
          if (result instanceof Error) throw result;
          if (result === undefined)
            throw new Error(`Unexpected request: ${url}`);
          return result;
        },
      };
      return request;
    }),
  };
  return { service, requests };
}

describe("compliance scheduled-action collection", () => {
  it("uses the expanded parent when the direct relation GET is unsupported", async () => {
    const { service, requests } = mockService({
      ...policy,
      scheduledActionsForRule: [rule],
    });
    const [result] = await service.getCompliancePoliciesDetailed();
    expect(requests).toContainEqual({
      url: parent,
      version: "beta",
      expand: expansion,
    });
    expect(
      requests.some(({ url }) => url.endsWith("/scheduledActionsForRule")),
    ).toBe(false);
    expect(result.scheduledActionsForRule).toEqual([rule]);
    expect(result.passwordRequired).toBe(true);
    expect(result.assignments).toEqual(assignments);
    expect(result.collectionStatus).toEqual({
      assignments: "complete",
      scheduledActionsForRule: "complete",
    });
    expect(service.getFetchErrors()).toEqual([]);
  });

  it.each([
    ["route rejection", routingError()],
    ["forbidden", Object.assign(new Error("Forbidden"), { statusCode: 403 })],
    ["missing expansion", { ...policy }],
    [
      "missing nested expansion",
      { ...policy, scheduledActionsForRule: [{ id: "rule" }] },
    ],
  ])("preserves policy and assignments after %s", async (_name, response) => {
    const { service } = mockService(response);
    const [result] = await service.getCompliancePoliciesDetailed();
    expect(result.passwordRequired).toBe(true);
    expect(result.assignments).toEqual(assignments);
    expect(result.collectionStatus).toEqual({
      assignments: "complete",
      scheduledActionsForRule: "incomplete",
    });
    expect(service.getFetchErrors()).toEqual([
      expect.objectContaining({
        policyId: policy.id,
        familyKey: "compliancePolicies",
        endpoint: `${parent}?$expand=${expansion}`,
        error: expect.stringContaining(
          "Scheduled noncompliance actions could not be fully collected",
        ),
        partial: true,
      }),
    ]);
  });

  it("distinguishes a confirmed empty collection from missing data", async () => {
    const { service } = mockService({ ...policy, scheduledActionsForRule: [] });
    const [result] = await service.getCompliancePoliciesDetailed();
    expect(result.scheduledActionsForRule).toEqual([]);
    expect(result.collectionStatus.scheduledActionsForRule).toBe("complete");
    expect(service.getFetchErrors()).toEqual([]);
  });

  it("follows both expanded rule and action continuation links", async () => {
    const rulesNext = `https://graph.microsoft.com/beta${parent}/scheduledActionsForRule?$skiptoken=rules`;
    const actionsNext = `https://graph.microsoft.com/beta${parent}/scheduledActionsForRule/rule/scheduledActionConfigurations?$skiptoken=actions`;
    const email = {
      id: "email",
      actionType: "notification",
      gracePeriodHours: 0,
    };
    const secondRule = { ...rule, id: "second-rule" };
    const { service, requests } = mockService(
      {
        ...policy,
        scheduledActionsForRule: [
          {
            ...rule,
            "scheduledActionConfigurations@odata.nextLink": actionsNext,
          },
        ],
        "scheduledActionsForRule@odata.nextLink": rulesNext,
      },
      new Map([
        [rulesNext, { value: [secondRule] }],
        [actionsNext, { value: [email] }],
      ]),
    );
    const [result] = await service.getCompliancePoliciesDetailed();
    expect(result.scheduledActionsForRule).toHaveLength(2);
    expect(
      result.scheduledActionsForRule[0].scheduledActionConfigurations,
    ).toEqual([block, email]);
    expect(result.collectionStatus.scheduledActionsForRule).toBe("complete");
    expect(requests).toContainEqual({ url: rulesNext });
    expect(requests).toContainEqual({ url: actionsNext });
    expect(service.getFetchErrors()).toEqual([]);
  });

  it("retains collected actions when a continuation request fails", async () => {
    const next = `https://graph.microsoft.com/beta${parent}/scheduledActionsForRule/rule/scheduledActionConfigurations?$skiptoken=actions`;
    const { service } = mockService(
      {
        ...policy,
        scheduledActionsForRule: [
          { ...rule, "scheduledActionConfigurations@odata.nextLink": next },
        ],
      },
      new Map([
        [next, Object.assign(new Error("Forbidden"), { statusCode: 403 })],
      ]),
    );
    const [result] = await service.getCompliancePoliciesDetailed();
    expect(
      result.scheduledActionsForRule[0].scheduledActionConfigurations,
    ).toEqual([block]);
    expect(result.assignments).toEqual(assignments);
    expect(result.collectionStatus.scheduledActionsForRule).toBe("incomplete");
    expect(service.getFetchErrors()[0].statusCode).toBe(403);
  });
});
