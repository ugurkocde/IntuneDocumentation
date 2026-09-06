import { describe, it, expect } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";

const assignment = {
  target: {
    groupId: "group-example",
    deviceAndAppManagementAssignmentFilterId: "filter-example",
    deviceAndAppManagementAssignmentFilterType: "exclude",
  },
};
const routeError = () =>
  Object.assign(
    new Error(
      "No OData route exists that match template ~/singleton/navigation/key/navigation with http verb GET",
    ),
    { statusCode: 400 },
  );
const forbidden = () =>
  Object.assign(new Error("Forbidden"), { statusCode: 403 });

describe.each([
  ["macOS", "deviceShellScripts", "getMacOSScriptsDetailed"],
  ["Windows", "deviceManagementScripts", "getWindowsScriptsDetailed"],
])("%s script assignments", (_platform, family, method) => {
  function setup(
    direct: unknown,
    expanded: unknown = { assignments: [assignment] },
    next?: unknown,
  ) {
    const root = `/deviceManagement/${family}`;
    const parent = `${root}/script-id`;
    const nextLink = `https://graph.microsoft.com/beta${parent}/assignments?$skiptoken=next`;
    const service = new DetailedIntuneService("test-token") as any;
    service.retryWithBackoff = (fn: () => Promise<unknown>) => fn();
    const requests: {
      url: string;
      expand?: string;
      version?: string;
      select?: string;
    }[] = [];
    service.client = {
      api: (url: string) => {
        const entry: (typeof requests)[number] = { url };
        requests.push(entry);
        const request: any = {
          version: (v: string) => {
            entry.version = v;
            return request;
          },
          expand: (v: string) => {
            entry.expand = v;
            return request;
          },
          select: (v: string) => {
            entry.select = v;
            return request;
          },
          top: () => request,
          get: async () => {
            if (url.includes("('")) throw routeError();
            let result: unknown;
            if (url === root)
              result = {
                value: [
                  {
                    id: "script-id",
                    displayName: "Example",
                    runAsAccount: "system",
                  },
                ],
              };
            else if (url === parent)
              result = entry.expand
                ? expanded
                : {
                    scriptContent:
                      Buffer.from("echo example").toString("base64"),
                  };
            else if (url === `${parent}/assignments`) result = direct;
            else if (url === nextLink) result = next;
            else throw new Error(`Unexpected request ${url}`);
            if (result instanceof Error) throw result;
            return result;
          },
        };
        return request;
      },
    };
    return {
      service,
      requests,
      parent,
      nextLink,
      read: () => service[method](),
    };
  }
  it("uses canonical routes and retains content, targets and filters", async () => {
    const { read, requests, service } = setup({ value: [assignment] });
    const [result] = await read();
    expect(result.assignments).toEqual([assignment]);
    expect(result.scriptContent).toBe("echo example");
    expect(result.collectionStatus).toEqual({
      details: "complete",
      assignments: "complete",
    });
    expect(requests.some((r) => r.url.includes("('") || r.expand)).toBe(false);
    expect(service.getFetchErrors()).toEqual([]);
  });
  it("recovers routing errors through parent expansion and follows pagination", async () => {
    const state = setup(routeError());
    const expanded = {
      assignments: [assignment],
      "assignments@odata.nextLink": state.nextLink,
    };
    const { read, requests, service, parent } = setup(routeError(), expanded, {
      value: [{ target: { groupId: "second" } }],
    });
    const [result] = await read();
    expect(result.assignments).toHaveLength(2);
    expect(requests).toContainEqual({
      url: parent,
      version: "beta",
      expand: "assignments",
    });
    expect(requests).toContainEqual({ url: state.nextLink });
    expect(service.getFetchErrors()).toEqual([]);
  });
  it("does not hide permission errors behind a fallback", async () => {
    const { read, requests, service } = setup(forbidden());
    const [result] = await read();
    expect(result.scriptContent).toBe("echo example");
    expect(result.collectionStatus.assignments).toBe("incomplete");
    expect(requests.some((r) => r.expand)).toBe(false);
    expect(service.getFetchErrors()[0].statusCode).toBe(403);
  });
  it.each([{}, forbidden()])(
    "marks omitted or failed expansions incomplete",
    async (expanded) => {
      const { read, service } = setup(routeError(), expanded);
      const [result] = await read();
      expect(result.collectionStatus.assignments).toBe("incomplete");
      expect(result.scriptContent).toBe("echo example");
      expect(service.getFetchErrors()[0].endpoint).toContain(
        "?$expand=assignments",
      );
    },
  );
  it("accepts a confirmed empty expansion", async () => {
    const { read, service } = setup(routeError(), { assignments: [] });
    const [result] = await read();
    expect(result.assignments).toEqual([]);
    expect(result.collectionStatus.assignments).toBe("complete");
    expect(service.getFetchErrors()).toEqual([]);
  });
  it("retains partial assignments when an expanded continuation fails", async () => {
    const state = setup(routeError());
    const { read, service } = setup(
      routeError(),
      {
        assignments: [assignment],
        "assignments@odata.nextLink": state.nextLink,
      },
      forbidden(),
    );
    const [result] = await read();
    expect(result.assignments).toEqual([assignment]);
    expect(result.collectionStatus.assignments).toBe("incomplete");
    expect(service.getFetchErrors()[0].statusCode).toBe(403);
  });
});
