const problems = [
  "Leads fall through the cracks because follow-up is manual and inconsistent",
  "Content goes quiet for weeks because there's no system behind it",
  "Hours spent on tasks that could run automatically",
  "AI is moving fast and there's no time to figure out what matters",
  "You're doing everything yourself and it's not scalable",
];

const solutions = [
  "Every lead captured, qualified, and followed up with — automatically",
  "Content published consistently in your voice without you writing it",
  "A custom AI assistant that knows your business as well as you do",
  "Monthly intelligence on what's working in AI — applied specifically to you",
  "A system that gets smarter the longer you're a client",
];

const ProblemSolutionSection = () => {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 min-h-[60vh]">
      <div className="bg-cream px-8 md:pl-[52px] md:pr-16 py-24 md:py-[120px] border-r border-mist-custom">
        <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-6 reveal">The Problem</p>
        <h2 className="font-serif text-[clamp(36px,4vw,52px)] font-light leading-[1.1] text-ink mb-10 reveal">
          Most small businesses<br />run on <em className="italic">chaos.</em>
        </h2>
        <ul className="list-none">
          {problems.map((p, i) => (
            <li
              key={i}
              className="text-[14px] font-light leading-[1.8] text-charcoal py-3.5 border-b border-mist-custom flex gap-4 items-start reveal"
            >
              <span className="text-taupe text-[11px] mt-1 flex-shrink-0">✕</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-ink px-8 md:pl-16 md:pr-[52px] py-24 md:py-[120px]">
        <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-6 reveal">The Architecture</p>
        <h2 className="font-serif text-[clamp(36px,4vw,52px)] font-light leading-[1.1] text-warm-white mb-10 reveal">
          We build the system<br />that <em className="italic text-stone">runs it for you.</em>
        </h2>
        <ul className="list-none">
          {solutions.map((s, i) => (
            <li
              key={i}
              className="text-[14px] font-light leading-[1.8] text-stone py-3.5 border-b border-warm-white/[0.06] flex gap-4 items-start reveal"
            >
              <span className="text-accent text-[11px] mt-1 flex-shrink-0">→</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ProblemSolutionSection;
