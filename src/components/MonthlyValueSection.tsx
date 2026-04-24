const cards = [
  {
    num: "01",
    title: "AI Assistant\n*Update*",
    desc: "Your custom AI assistant updated every month — new offers, FAQs, seasonal angles, anything that changed. It sounds more like you every single month.",
    time: "Done for you · monthly",
  },
  {
    num: "02",
    title: "Content Prompt\n*Refresh*",
    desc: "Fresh content angles dropped into your publishing automation every month. Your content stays sharp, current, and never sounds like a template.",
    time: "Automatic · monthly",
  },
  {
    num: "03",
    title: "Monthly Strategy\n*Briefing*",
    desc: "One AI development relevant to your industry. One thing you should be doing differently. Delivered monthly so you stay ahead without following AI yourself.",
    time: "Specific to you · monthly",
  },
];

const renderTitle = (title: string) => {
  const parts = title.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? (
      <em key={i} className="italic">{part.slice(1, -1)}</em>
    ) : (
      <span key={i} className="whitespace-pre-line">{part}</span>
    )
  );
};

const MonthlyValueSection = () => {
  return (
    <section className="py-[140px] px-8 md:px-[52px] bg-ink relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[140px] md:text-[220px] font-light text-warm-white/[0.02] whitespace-nowrap pointer-events-none select-none">
        MONTHLY
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20 relative">
        <div className="reveal">
          <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">The Ongoing Value</p>
          <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light leading-[0.95] text-warm-white">
            What keeps your<br /><em className="italic text-stone">system growing.</em>
          </h2>
        </div>
        <p className="text-[14px] font-light text-taupe leading-[1.9] reveal">
          The automations get you in. What keeps your AI OS improving every month is the intelligence layered on top — making your system smarter, your content fresher, and your business more competitive over time.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] relative">
        {cards.map((c, i) => (
          <div
            key={c.num}
            className={`bg-warm-white/[0.03] border border-warm-white/[0.05] p-12 md:p-12 md:px-9 relative transition-colors duration-400 hover:bg-accent/10 hover:border-accent/25 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-accent before:opacity-50 reveal ${i > 0 ? `reveal-delay-${i}` : ""}`}
          >
            <div className="font-serif text-[64px] font-light text-warm-white/[0.04] leading-none mb-4">{c.num}</div>
            <div className="font-serif text-[26px] font-light text-warm-white mb-4 leading-[1.1]">
              {renderTitle(c.title)}
            </div>
            <p className="text-[15px] font-light leading-[1.85] text-taupe mb-5">{c.desc}</p>
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent">{c.time}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MonthlyValueSection;
