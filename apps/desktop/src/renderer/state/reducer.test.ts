// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInitialState, reducer } from "./reducer";

describe("settings search state", () => {
  it("keeps the last search and clears it with the collection", () => {
    const search = {
      query: "bitlocker",
      families: ["settingsCatalog"],
      platforms: ["Windows"],
    };
    const searched = reducer(createInitialState(), {
      type: "settingsSearch",
      search,
    });
    expect(searched.settingsSearch).toEqual(search);

    const reset = reducer(searched, { type: "resetCollection" });
    expect(reset.settingsSearch).toEqual({
      query: "",
      families: [],
      platforms: [],
    });
  });
});

describe("CIS Benchmarks availability", () => {
  const signedIn = (account: string, tenantId: string) => ({
    signedIn: true,
    account,
    tenantId,
    expiresOn: null,
  });

  it("starts as coming soon and opens the screen only when internal", () => {
    const initial = createInitialState();
    expect(initial.benchmarks).toBe("comingSoon");
    expect(
      reducer(initial, { type: "navigate", screen: "benchmarks" }).screen,
    ).toBe("compliance");
    const internal = reducer(initial, {
      type: "benchmarks",
      availability: "internal",
    });
    expect(
      reducer(internal, { type: "navigate", screen: "benchmarks" }).screen,
    ).toBe("benchmarks");
  });

  it("leaves the screen when the claim goes away", () => {
    let state = reducer(createInitialState(), {
      type: "benchmarks",
      availability: "internal",
    });
    state = reducer(state, { type: "navigate", screen: "benchmarks" });
    state = reducer(state, { type: "benchmarks", availability: "comingSoon" });
    expect(state.benchmarks).toBe("comingSoon");
    expect(state.screen).toBe("compliance");
  });

  it("closes on sign out and account change, not on a refresh of the same account", () => {
    let state = reducer(createInitialState(), {
      type: "auth",
      auth: signedIn("a@synthetic.example", "t1"),
    });
    state = reducer(state, { type: "benchmarks", availability: "internal" });
    state = reducer(state, { type: "navigate", screen: "benchmarks" });

    const refreshed = reducer(state, {
      type: "auth",
      auth: signedIn("a@synthetic.example", "t1"),
    });
    expect(refreshed.benchmarks).toBe("internal");
    expect(refreshed.screen).toBe("benchmarks");

    const switched = reducer(state, {
      type: "auth",
      auth: signedIn("b@synthetic.example", "t2"),
    });
    expect(switched.benchmarks).toBe("comingSoon");
    expect(switched.screen).toBe("compliance");

    const signedOut = reducer(state, {
      type: "auth",
      auth: { signedIn: false, account: null, tenantId: null, expiresOn: null },
    });
    expect(signedOut.benchmarks).toBe("comingSoon");
  });
});
