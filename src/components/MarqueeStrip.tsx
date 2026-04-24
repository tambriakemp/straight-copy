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
    <div className="bg-accent py-5 overflow-hidden whitespace-nowrap">
      <div className="inline-flex animate-marquee-slow">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center">
            <span className="font-serif text-[17px] font-light italic tracking-[0.1em] text-warm-white/95 px-12">
              {item}
            </span>
            <span className="text-warm-white/45 px-1 text-[17px]">·</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default MarqueeStrip;
