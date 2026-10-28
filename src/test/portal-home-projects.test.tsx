/**
 * "Your projects" on the client's home screen (CRE-776, Bree's 28 Oct call).
 *
 * The shaping either source does is pinned in `client-portal-source.test.ts`.
 * What is left is the one decision that only exists in the component, and it
 * is the kind a unit test on a pure function cannot reach: **absent and empty
 * are not the same thing.**
 *
 * `HomeView.projects` is optional because the edge function and the frontend
 * deploy separately and in that order (see `docs/client-portal.md`), so for
 * the length of a deploy the browser can be newer than the server it is
 * talking to. An absent field means "this server does not send projects" and
 * draws no card; an empty array means "this client has none" and says so.
 * Collapse the two and every client gets a card reading "Nothing on the go
 * right now" over a portal whose server simply has not caught up — which is
 * both wrong and the most alarming possible way to be wrong, on the screen a
 * client opens first.
 *
 * Rendered rather than asserted on props: the branch lives in JSX.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import type { HomeView, PortalProject } from "@/lib/clientPortalWire";

const view = vi.hoisted(() => ({ current: null as HomeView | null }));

vi.mock("@/components/portal/useClientPortal", () => ({
  useAdminPreview: () => ({ adminPreview: false, exitPreview: () => {} }),
  usePortalView: () => ({
    data: view.current,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

const { default: ClientHome } = await import("@/pages/portal/ClientHome");

const PROJECT: PortalProject = {
  id: "p-1",
  name: "Glowskin Studio website",
  kind: "Website",
  statusLabel: "In progress",
  href: "/portal/client-7/projects/admin-99",
  updatedAt: null,
};

function home(over: Partial<HomeView> = {}): HomeView {
  return {
    branding: {
      agencyName: "Northhill Studio",
      monogram: "NS",
      contactName: null,
      replyWindow: null,
      contactEmail: null,
    },
    me: { clientId: "client-7", displayName: "Maya", businessName: null, initials: "M" },
    headline: null,
    stepNumber: null,
    stepCount: null,
    targetDate: null,
    milestones: [],
    waitingOnYou: [],
    nextPayment: null,
    updates: [],
    ...over,
  };
}

function renderHome(value: HomeView) {
  view.current = value;
  return render(
    <MemoryRouter initialEntries={["/portal/client-7"]}>
      <ClientHome />
    </MemoryRouter>,
  );
}

describe("the projects card", () => {
  it("is not drawn at all by a server that does not send the field", () => {
    const { container } = renderHome(home());
    expect(container.querySelector(".cp-projects")).toBeNull();
    expect(screen.queryByText(/Nothing on the go/)).toBeNull();
  });

  it("says so for a client who genuinely has none", () => {
    renderHome(home({ projects: [] }));
    expect(screen.getByText(/Nothing on the go right now/)).toBeInTheDocument();
  });

  it("counts the projects it lists, and links the ones with a page", () => {
    const { container } = renderHome(
      home({
        projects: [PROJECT, { ...PROJECT, id: "p-2", name: "Spring campaign", href: null }],
      }),
    );
    expect(container.querySelector(".cp-projects .cp-card__title")?.textContent).toBe(
      "Your projects · 2",
    );
    // One Open button, for the one project this portal has a page for. A
    // button on the other would 404: see `pluginProjects`.
    expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(1);
  });

  it("draws no meta line at all when a source could answer none of it", () => {
    // Not an empty line: the row is one line, rather than one line and a gap
    // where "· ·" would otherwise have been.
    const { container } = renderHome(
      home({
        projects: [
          { id: "p-3", name: "Spring campaign", kind: null, statusLabel: null, href: null, updatedAt: null },
        ],
      }),
    );
    expect(screen.getByText("Spring campaign")).toBeInTheDocument();
    expect(container.querySelector(".cp-projects__meta")).toBeNull();
  });

  it("joins only what it was given", () => {
    const { container } = renderHome(
      home({ projects: [{ ...PROJECT, statusLabel: null }] }),
    );
    expect(container.querySelector(".cp-projects__meta")?.textContent).toBe("Website");
  });
});
