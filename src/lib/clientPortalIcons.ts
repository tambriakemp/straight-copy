// The icons mockup 13 draws beside a row in "Waiting on you".
//
// Their own module because they are data, not a component -- and because a
// constant exported from a component file costs Fast Refresh on that file.

import type { WaitingIcon } from "@/lib/clientPortalWire";

/**
 * The characters mockup 13 draws beside a waiting row.
 *
 * EVERY ONE ENDS IN U+FE0F, and the card renders a tofu box without it. A
 * browser picks the font for a character from the element's own stack and
 * only falls through to the colour-emoji font for characters that ask for
 * emoji presentation. 🖼 and ✍ do not ask: they are `Emoji_Presentation=No`,
 * so Chromium hunts them through Karla and the sans-serif fallbacks, finds
 * nothing, and draws the box -- which is exactly what the first render of
 * this card did. 👀 came out fine two rows down because it is
 * `Emoji_Presentation=Yes`, which is the whole tell. U+FE0F is the variation
 * selector that asks, and asking is all it takes.
 *
 * Kept here as a closed list rather than a string on the wire, so that what
 * a licensee's plugin picks is an icon and not arbitrary characters dropped
 * into the client's screen. See `WaitingIcon`.
 */
export const WAITING_ICONS: Record<WaitingIcon, string> = {
  sign: "✍️",
  upload: "\u{1F5BC}️",
  review: "\u{1F440}️",
  pay: "\u{1F4B3}️",
};
