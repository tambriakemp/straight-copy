const stats = [
  { num: "2", label: "Core automations every client gets" },
  { num: "3", label: "Monthly deliverables that build over time" },
  { num: "∞", label: "The system compounds — no ceiling" },
  { num: "0", label: "Tech knowledge required from you" },
];

const PhilosophySection = () => {
  return (
    <section id="philosophy" className="py-[120px] md:py-[160px] bg-cream">
      <div className="max-w-[1400px] mx-auto px-7 md:px-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center">
          <div className="reveal">
            <p className="inline-flex items-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-8 before:content-[''] before:w-9 before:h-px before:bg-accent">
              Who We Are
            </p>
            <h2
              className="font-serif font-light text-ink leading-[1.02] mb-12"
              style={{ fontSize: "clamp(48px, 5.2vw, 80px)", letterSpacing: "-0.01em" }}
            >
              AI Business <em className="italic text-accent">Architects.</em>
            </h2>
            <p className="text-[17px] font-light leading-[1.85] text-charcoal mb-6 max-w-[520px]">
              We don't set up tools. We design intelligent systems — the kind that learn your business, run in the background, and compound in value the longer they run.
            </p>
            <p className="text-[17px] font-light leading-[1.85] text-charcoal mb-6 max-w-[520px]">
              An architect doesn't maintain buildings. They design systems that stand on their own. That's what we build for your business — a structure that works whether you're there or not.
            </p>
            <p className="text-[17px] font-light leading-[1.85] text-charcoal mb-6 max-w-[520px]">
              Every month your AI gets better at being you. Every month your system gets harder to replace. That's the architecture.
            </p>
            <div className="font-serif text-[24px] font-light italic text-accent mt-12 pt-10 border-t border-sand max-w-[520px] leading-[1.4]">
              "I architect the AI systems that run your business so you don't have to."
            </div>
          </div>
          <div className="reveal reveal-delay-1">
            <div className="grid grid-cols-2 gap-[2px] bg-sand">
              {stats.map((s) => (
                <div key={s.label} className="bg-ink p-10 md:px-11 md:py-14">
                  <div className="font-serif text-[64px] md:text-[88px] font-light text-warm-white leading-[0.95] mb-5">
                    {s.num}
                  </div>
                  <div className="text-[13px] font-normal tracking-[0.14em] uppercase text-stone leading-[1.5]">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PhilosophySection;
