const items = [
  "AI Business Architecture",
  "Lead Automation",
  "Content Publishing",
  "Brand AI Assistants",
  "Business Systems",
  "Monthly Strategy",
];

const MarqueeStrip = () => {
  return (
    <div className="bg-accent py-4 overflow-hidden whitespace-nowrap">
      <div className="inline-flex animate-marquee">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center">
            <span className="font-serif text-sm font-light italic tracking-[0.08em] text-warm-white/85 px-10">
              {item}
            </span>
            <span className="text-warm-white/40 px-1">·</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default MarqueeStrip;
