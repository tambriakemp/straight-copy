import type { MouseEvent } from "react";
import { classifyRefChips, issueUrl, linkifySegments } from "@/lib/issueLinks";

// Stops a ref/inline link click from bubbling into a parent row's own click
// handler (e.g. a future "open this card" row click) — CRE-366 §2b.
function stop(e: MouseEvent) {
  e.stopPropagation();
}

/** Renders free text with every recognized issue id ("CRE-335", and ranges
 *  like "CRE-269–285") linked to its Paperclip card in a new tab. Plain
 *  text otherwise — see `linkifySegments` for what counts as an id. */
export function LinkifiedText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <>
      {linkifySegments(text).map((seg, i) =>
        seg.prefix && seg.num ? (
          <a
            key={i}
            href={issueUrl(seg.prefix, seg.num)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** Renders a `task_ids`-style array as small monospace ref chips, each
 *  linked where recognizable (see `classifyRefChips`). */
export function IssueRefChips({ ids, className = "ref" }: { ids: string[]; className?: string }) {
  if (!ids.length) return null;
  return (
    <>
      {classifyRefChips(ids).map((chip, i) =>
        chip.prefix && chip.num ? (
          <a key={i} className={className} href={issueUrl(chip.prefix, chip.num)} target="_blank" rel="noopener noreferrer" onClick={stop}>
            {chip.raw}
          </a>
        ) : (
          <span key={i} className={className}>
            {chip.raw}
          </span>
        ),
      )}
    </>
  );
}
