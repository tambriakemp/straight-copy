const stats = [
  { num: "2", label: "Core automations every client gets" },
  { num: "3", label: "Monthly deliverables that build over time" },
  { num: "∞", label: "The system compounds — no ceiling" },
  { num: "0", label: "Tech knowledge required from you" },
];

const PhilosophySection = () => {
  return (
    <section
      id="philosophy"
      className="py-[140px] px-8 md:px-[52px] bg-cream grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center"
    >
      <div className="reveal">
        <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-6">Who We Are</p>
        <h2 className="font-serif text-[clamp(40px,5vw,68px)] font-light leading-[1.05] text-ink mb-8">
          AI Business<br /><em className="italic">Architects.</em>
        </h2>
        <p className="text-[15px] font-light leading-[1.9] text-charcoal mb-5">
          We don't set up tools. We design intelligent systems — the kind that learn your business, run in the background, and compound in value the longer they run.
        </p>
        <p className="text-[15px] font-light leading-[1.9] text-charcoal mb-5">
          An architect doesn't maintain buildings. They design systems that stand on their own. That's what we build for your business — a structure that works whether you're there or not.
        </p>
        <p className="text-[15px] font-light leading-[1.9] text-charcoal mb-5">
          Every month your AI gets better at being you. Every month your system gets harder to replace. That's the architecture.
        </p>
        <div className="font-serif text-[22px] font-light italic text-accent mt-9 pt-9 border-t border-sand">
          "I architect the AI systems that run your business so you don't have to."
        </div>
      </div>
      <div className="reveal reveal-delay-1">
        <div className="grid grid-cols-2 gap-[2px]">
          {stats.map((s) => (
            <div key={s.label} className="bg-ink p-10">
              <div className="font-serif text-[56px] font-light text-warm-white leading-none mb-2">{s.num}</div>
              <div className="text-[11px] tracking-[0.15em] uppercase text-taupe">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PhilosophySection;
