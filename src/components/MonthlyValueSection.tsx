const cards = [
  {
    num: "01",
    title: "AI Assistant *Update*",
    desc: "Your custom AI assistant updated every month — new offers, FAQs, seasonal angles, anything that changed. It sounds more like you every single month.",
    time: "Done for you · monthly",
  },
  {
    num: "02",
    title: "Content Prompt *Refresh*",
    desc: "Fresh content angles dropped into your publishing automation every month. Your content stays sharp, current, and never sounds like a template.",
    time: "Automatic · monthly",
  },
  {
    num: "03",
    title: "Monthly Strategy *Briefing*",
    desc: "One AI development relevant to your industry. One thing you should be doing differently. Delivered monthly so you stay ahead without following AI yourself.",
    time: "Specific to you · monthly",
  },
];

const renderTitle = (title: string) => {
  const parts = title.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? (
      <em key={i} className="italic text-stone">{part.slice(1, -1)}</em>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

const MonthlyValueSection = () => {
  return (
    <section className="py-[120px] md:py-[160px] bg-ink relative overflow-hidden">
      {/* MONTHLY watermark */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif font-light text-warm-white/[0.02] whitespace-nowrap pointer-events-none select-none leading-none"
        style={{ fontSize: "clamp(140px, 22vw, 280px)" }}
      >
        MONTHLY
      </div>

      <div className="max-w-[1400px] mx-auto px-7 md:px-16 relative">
        {/* Centered section header */}
        <div className="max-w-[960px] mx-auto text-center mb-20 md:mb-24 reveal">
          <p className="inline-flex items-center justify-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-8 before:content-[''] before:w-9 before:h-px before:bg-accent after:content-[''] after:w-9 after:h-px after:bg-accent">
            The Ongoing Value
          </p>
          <h2
            className="font-serif font-light leading-[1.05] text-warm-white mb-8"
            style={{ fontSize: "clamp(48px, 5.2vw, 80px)", letterSpacing: "-0.01em" }}
          >
            What keeps your <em className="italic text-stone">system growing.</em>
          </h2>
          <p className="text-[19px] font-light leading-[1.75] text-stone max-w-[680px] mx-auto">
            The automations get you in. What keeps your AI OS improving every month is the intelligence layered on top — making your system smarter, your content fresher, and your business more competitive over time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-warm-white/[0.05]">
          {cards.map((c, i) => (
            <div
              key={c.num}
              className={`group bg-ink p-12 md:p-[48px] md:py-[64px] relative transition-colors duration-400 hover:bg-accent/[0.12] reveal ${
                i > 0 ? `reveal-delay-${i}` : ""
              }`}
            >
              <div className="font-serif text-[72px] font-light text-warm-white/[0.12] leading-none mb-8 transition-colors duration-400 group-hover:text-accent">
                {c.num}
              </div>
              <h3 className="font-serif text-[28px] md:text-[32px] font-light text-warm-white mb-6 leading-[1.1]">
                {renderTitle(c.title)}
              </h3>
              <p className="text-[16px] font-light leading-[1.75] text-stone mb-9">{c.desc}</p>
              <div className="text-[11px] font-medium tracking-[0.22em] uppercase text-accent pt-6 border-t border-warm-white/[0.08]">
                {c.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MonthlyValueSection;
