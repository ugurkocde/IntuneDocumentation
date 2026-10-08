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
