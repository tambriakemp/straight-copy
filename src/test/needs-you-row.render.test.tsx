// CRE-391: NeedsYouRow is now the single render path for every "Needs you
// now" row — live Paperclip items, approvals, in-flight/stuck, and
// narrative brief lines (see needsYouRows.ts). Covers both marker kinds
// (dot and icon) and the title-link / taskIds / done-strikethrough behavior
// that used to be exercised indirectly through InFlightCard's own test.
import { AlertTriangle } from "lucide-react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import NeedsYouRow from "../components/admin/cv/NeedsYouRow";

const noop = { isDone: () => false, complete: async () => true, undo: async () => true };

describe("NeedsYouRow (CRE-391)", () => {
  it("renders a dot marker row with category pill, description and task chip", () => {
    render(
      <NeedsYouRow
        marker={{ kind: "dot", color: "#eab308", label: "Normal priority" }}
        title="Needs your input"
        description="interaction"
        category="interaction"
        taskIds={["CRE-335"]}
        href={null}
        done={false}
        onComplete={noop.complete}
        onUndo={noop.undo}
      />,
    );
    expect(screen.getByText("Needs your input")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CRE-335" })).toHaveAttribute("href", "https://paperclip.cre8visions.com/CRE/issues/CRE-335");
  });

  it("renders an icon marker row (in-flight status) with its label as a title attribute", () => {
    render(
      <NeedsYouRow
        marker={{ kind: "icon", icon: AlertTriangle, color: "#dc2626", label: "Stuck" }}
        title="Menovia App Store review"
        description={null}
        category="Menovia"
        taskIds={["CRE-351"]}
        href={null}
        done={false}
        onComplete={noop.complete}
        onUndo={noop.undo}
      />,
    );
    expect(screen.getByTitle("Stuck")).toBeInTheDocument();
    expect(screen.getByText("Menovia App Store review")).toBeInTheDocument();
  });

  it("wraps the title in a link when href is set, and strikes it through when done", () => {
    render(
      <NeedsYouRow
        marker={{ kind: "dot", color: "#9ca3af", label: "New" }}
        title="Approve the Oct 12 prospect previews"
        description="35 previews pending."
        category="Outreach"
        taskIds={[]}
        href="/admin/approvals"
        done
        onComplete={noop.complete}
        onUndo={noop.undo}
      />,
    );
    const link = screen.getByRole("link", { name: "Approve the Oct 12 prospect previews" });
    expect(link).toHaveAttribute("href", "/admin/approvals");
    expect(link.closest("b")).toHaveStyle({ textDecoration: "line-through" });
  });
});
