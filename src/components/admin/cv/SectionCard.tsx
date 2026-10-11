import { ReactNode } from "react";
import Card from "./Card";
import type { ChipTone } from "@/lib/pipelineTone";

// CRE-388: Bree's complaint was that section titles "get lost" and she
// couldn't tell where one section started or stopped — every section is a
// card with its own header rather than a bare uppercase label floating
// inside one giant shared card.
//
// Relaid out to the Admin Journeys canvas, which writes that header as a
// plain h2, a tinted count pill and whatever else belongs on the line. The
// icon chip in front of the title is gone: on the canvas nothing carries
// one, and at 14px inside a 20px rounded square it was decoration on a
// word that already says what the section is.
//
// `sub` sits next to the title, `right` is pushed to the far end. Both used
// to be one `right` prop set to whichever, which is why "Your agents are
// waiting on a yes or no" ended up in the opposite corner of the card from
// the title it explains.
export default function SectionCard({
  title,
  count,
  countTone = "gray",
  sub,
  right,
  children,
}: {
  title: ReactNode;
  count?: number;
  countTone?: ChipTone;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="cv-card-pad cv-section">
      <div className="cv-card-head">
        <h2 className="cv-card-title">{title}</h2>
        {typeof count === "number" && (
          <span className={`cv-chip cv-chip--${countTone}`}>{count}</span>
        )}
        {sub && <span className="cv-card-sub">{sub}</span>}
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      <div className="cv-section__body">{children}</div>
    </Card>
  );
}
