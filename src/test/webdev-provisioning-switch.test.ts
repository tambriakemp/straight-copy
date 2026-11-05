import { describe, expect, it } from "vitest";
import { webDevProvisioningEnabledFrom } from "../../supabase/functions/_shared/webdev-provisioning-switch.ts";

// CRE-828. These assertions are the reason the switch is safe to merge before
// the plugin flow has been verified, and the reason a bad minute cannot stop a
// paying client getting a project. Only an explicit `false` turns `/admin` off.
describe("webDevProvisioningEnabledFrom", () => {
  it("is on before the cutover, when the column says true", () => {
    expect(
      webDevProvisioningEnabledFrom(
        { surecart_webdev_provisioning_enabled: true },
        null,
      ),
    ).toBe(true);
  });

  it("is off only on an explicit false -- the cutover itself", () => {
    expect(
      webDevProvisioningEnabledFrom(
        { surecart_webdev_provisioning_enabled: false },
        null,
      ),
    ).toBe(false);
  });

  it("stays on when the read failed, rather than dropping the purchase", () => {
    expect(
      webDevProvisioningEnabledFrom(null, { code: "42703", message: "column does not exist" }),
    ).toBe(true);
  });

  it("stays on when the read failed even if the row said false", () => {
    // The row cannot be trusted alongside an error, and the safe reading of an
    // untrustworthy answer here is "keep provisioning".
    expect(
      webDevProvisioningEnabledFrom(
        { surecart_webdev_provisioning_enabled: false },
        new Error("network"),
      ),
    ).toBe(true);
  });

  it("stays on when the migration has not been applied yet", () => {
    // PostgREST returns no such column; a deploy that lands before the
    // migration must behave exactly as it did yesterday.
    expect(webDevProvisioningEnabledFrom({}, null)).toBe(true);
  });

  it("stays on when the singleton settings row is missing", () => {
    expect(webDevProvisioningEnabledFrom(null, null)).toBe(true);
  });

  it("stays on when the column is null rather than false", () => {
    expect(
      webDevProvisioningEnabledFrom(
        { surecart_webdev_provisioning_enabled: null },
        null,
      ),
    ).toBe(true);
  });
});
