// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KpiCards } from "./KpiCards";

afterEach(cleanup);

const breakdown = {
  policies: 224,
  apps: 537,
  appsAssigned: 67,
  rbac: 45,
  microsoftDefaults: 23,
  microsoftDefaultsInRbac: 11,
};

const base = {
  configurations: 818,
  sections: 30,
  families: 15,
  warnings: 0,
  permissionGaps: 0,
  loading: false,
};

describe("KpiCards", () => {
  it("leads with policies and profiles and shows the rest separately", () => {
    const onShowApps = vi.fn();
    const onShowRbac = vi.fn();
    render(<KpiCards {...base} breakdown={breakdown} onShowApps={onShowApps} onShowRbac={onShowRbac} onShowFamilies={() => undefined} />);
    const headline = screen.getByRole("button", { name: "Show 224 policies and profiles by family" });
    expect(headline).toHaveTextContent("Policies and profiles");
    expect(headline).toHaveTextContent("Of 818 collected items");
    const apps = screen.getByRole("button", { name: "Show 537 apps, 67 assigned" });
    expect(apps).toHaveTextContent("67 assigned, 470 unassigned");
    fireEvent.click(apps);
    expect(onShowApps).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Show 45 assignment and RBAC items" }));
    expect(onShowRbac).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /23 Microsoft defaults/ })).toHaveTextContent(
      "Created by Microsoft, 11 of them in RBAC",
    );
    expect(screen.getByRole("region", { name: "Also collected" })).toBeInTheDocument();
  });

  it("falls back to every item for summaries without a breakdown", () => {
    render(<KpiCards {...base} onShowFamilies={() => undefined} />);
    expect(screen.getByRole("button", { name: "Show 818 configurations by family" })).toHaveTextContent(
      "Configurations",
    );
    expect(screen.queryByRole("region", { name: "Also collected" })).not.toBeInTheDocument();
  });
});
