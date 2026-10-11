import type { MoneyStatCard, MoneyStats } from "@/lib/briefs";
import { LinkifiedText } from "./IssueLinks";

// Money, laid out to the canvas: a stack of tiles, each a label, one large
// figure and the detail behind it, then the note and where the numbers came
// from.
//
// It used to be a grid of bordered, gradient-filled stat cards with an icon
// box and a trend badge each. In a ~500px sidebar column that grid was one
// card per row anyway, so the grid bought nothing and the chrome — border,
// gradient, icon chip, badge — crowded the only thing anyone reads, which
// is the figure.
//
// Money is data-only: no checkbox on any of it (CRE-366 §2a). Nothing here
// writes anything back.

function MoneyTile({ card, lead }: { card: MoneyStatCard; lead: boolean }) {
  return (
    <div className={`cv-tile ${lead ? "cv-tile--lead" : ""}`}>
      <span className="cv-tile__label">{card.label}</span>
      <b className="cv-tile__value">
        {card.display}
        {card.trend_label && <> <span className="cv-tile__trend">{card.trend_label}</span></>}
      </b>
      {card.lines?.map((line, i) => (
        <small key={i} className="cv-tile__sub"><LinkifiedText text={line} /></small>
      ))}
    </div>
  );
}

export default function MoneyCard({ stats }: { stats: MoneyStats }) {
  if (!stats.cards?.length) return null;
  return (
    <>
      <div className="cv-card-head">
        <h2 className="cv-card-title">Money</h2>
        {stats.range_label && <span className="cv-card-sub">{stats.range_label}</span>}
      </div>

      <div className="cv-tilestack">
        {stats.cards.map((card, i) => (
          // The first tile is the headline figure — the brief writes them
          // in the order it wants them read, so it is position and not an
          // id that decides which one is inverted.
          <MoneyTile key={card.id} card={card} lead={i === 0} />
        ))}
      </div>

      {stats.note && <p className="cv-card-note"><LinkifiedText text={stats.note} /></p>}
      {stats.source_label && <p className="cv-card-source">{stats.source_label}</p>}
    </>
  );
}
