/**
 * The admin login form can file a credential against one of this client's
 * projects, or against none. The list names the project when there is one.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import LoginsTab from "@/components/admin/client/LoginsTab";
import type { ClientLoginRow } from "@/lib/clientLogins";

const LOGIN: ClientLoginRow = {
  id: "l1",
  label: "Site host",
  url: null,
  username: "maya@glowskin.example",
  note: null,
  has_password: true,
  client_project_id: "p1",
};

function renderTab() {
  return render(
    <LoginsTab
      clientId="c1"
      clientName="Maya"
      clientEmail={null}
      logins={[LOGIN]}
      projects={[
        { id: "p1", name: "Website", status: "active" },
        { id: "p2", name: "Old site", status: "archived" },
      ]}
      onChanged={() => {}}
    />,
  );
}

describe("the admin login form's project field", () => {
  it("names the project on the row", () => {
    renderTab();
    expect(screen.getByText("Website")).toBeInTheDocument();
  });

  it("offers this client's projects, including an empty choice, when adding", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /add login/i }));
    const select = screen.getByRole("combobox", { name: /project/i });
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "No project" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Website" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Old site (archived)" })).toBeInTheDocument();
  });

  it("opens an existing login on the project it was saved with", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("combobox", { name: /project/i })).toHaveValue("p1");
  });
});
