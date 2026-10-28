/**
 * The waiting-row icons ask for emoji presentation, every one of them.
 *
 * This exists because the first render of the home screen drew a tofu box on
 * its first row. The cause is not obvious and is easy to reintroduce: a
 * browser resolves a character against the element's OWN font stack, and only
 * falls through to the colour-emoji font for characters that ask for emoji
 * presentation. 🖼 and ✍ do not ask -- they are `Emoji_Presentation=No` -- so
 * Chromium looked for them in Karla, found nothing, and drew the box. 👀, two
 * rows down, came out perfectly, because it is `Emoji_Presentation=Yes`.
 *
 * U+FE0F is the variation selector that asks. Nothing about an icon's
 * appearance in an editor says whether it needs one, which is exactly why a
 * test says it instead: the next icon added here will be chosen for how it
 * looks, not for its Unicode properties.
 */

import { describe, expect, it } from "vitest";
import { WAITING_ICONS } from "../lib/clientPortalIcons";

const VS16 = "️";

describe("the waiting-row icons", () => {
  it("every one asks for emoji presentation", () => {
    for (const [name, glyph] of Object.entries(WAITING_ICONS)) {
      expect(glyph.endsWith(VS16), `${name} (${JSON.stringify(glyph)}) must end in U+FE0F`).toBe(
        true,
      );
    }
  });

  it("covers every icon the wire contract allows", () => {
    // `Record<WaitingIcon, string>` already fails the build if one is
    // missing; this fails the test run if the union gains a member and the
    // table is widened to `string` to keep up.
    expect(Object.keys(WAITING_ICONS).sort()).toEqual(["pay", "review", "sign", "upload"]);
  });
});
