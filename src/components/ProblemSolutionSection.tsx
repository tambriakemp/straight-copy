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
    <section className="grid grid-cols-1 md:grid-cols-2 items-stretch">
      {/* Problem */}
      <div className="bg-cream px-8 md:px-[72px] py-24 md:py-[140px]">
        <p className="inline-flex items-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-taupe mb-10 reveal before:content-[''] before:w-9 before:h-px before:bg-taupe">
          The Problem
        </p>
        <h2
          className="font-serif font-light leading-[1.1] text-ink mb-16 reveal"
          style={{ fontSize: "clamp(40px, 4.2vw, 58px)", letterSpacing: "-0.01em" }}
        >
          Most small businesses run on <em className="italic text-accent">chaos.</em>
        </h2>
        <ul className="list-none">
          {problems.map((p, i) => (
            <li
              key={i}
              className="text-[17px] font-light leading-[1.7] text-charcoal py-6 border-b border-mist-custom grid grid-cols-[32px_1fr] gap-5 items-start reveal"
            >
              <span className="text-taupe text-[14px] leading-[1.7] mt-0.5">✕</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Solution */}
      <div className="bg-ink px-8 md:px-[72px] py-24 md:py-[140px]">
        <p className="inline-flex items-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-10 reveal before:content-[''] before:w-9 before:h-px before:bg-accent">
          The Architecture
        </p>
        <h2
          className="font-serif font-light leading-[1.1] text-warm-white mb-16 reveal"
          style={{ fontSize: "clamp(40px, 4.2vw, 58px)", letterSpacing: "-0.01em" }}
        >
          We build the system that <em className="italic text-stone">runs it for you.</em>
        </h2>
        <ul className="list-none">
          {solutions.map((s, i) => (
            <li
              key={i}
              className="text-[17px] font-light leading-[1.7] text-stone py-6 border-b border-warm-white/[0.08] grid grid-cols-[32px_1fr] gap-5 items-start reveal"
            >
              <span className="text-accent text-[14px] leading-[1.7] mt-0.5">→</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ProblemSolutionSection;
