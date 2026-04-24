import { Link } from "react-router-dom";

const blueprintCells = [
  {
    num: "01 — Foundation",
    title: "Lead Capture &\nOnboarding Flow",
    desc: "Every inquiry handled. Every new client onboarded. Automatically.",
  },
  {
    num: "02 — Visibility",
    title: "Social Content\nPublishing",
    desc: "Consistent content published in your voice. Without you touching it.",
  },
  {
    num: "03 — Intelligence",
    title: "Business\nBrain",
    desc: "Your full Claude Project — artifacts, SOPs, and skill files. The source of truth for everything. Growth tier.",
  },
  {
    num: "04 — Strategy",
    title: "Monthly AI\nBriefing",
    desc: "What's working in AI right now — applied to your business specifically.",
  },
];

const HeroSection = () => {
  return (
    <section className="min-h-screen bg-ink grid grid-cols-1 md:grid-cols-2 relative overflow-hidden">
      <div className="absolute -bottom-20 -right-10 font-serif text-[280px] md:text-[380px] font-light italic text-warm-white/[0.03] pointer-events-none leading-none tracking-[-0.05em] select-none">
        CV
      </div>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent to-transparent z-[2]" />

      <div className="flex flex-col justify-end px-8 md:pl-[52px] md:pr-16 pt-[140px] pb-24 md:pb-[100px] relative z-[2] border-r border-warm-white/5">
        <p className="text-[10px] tracking-[0.4em] uppercase text-accent mb-8 animate-fade-up animate-fade-up-delay-1">
          AI Business Architecture
        </p>
        <h1 className="font-serif text-[clamp(52px,6.5vw,96px)] font-light leading-[0.92] text-warm-white mb-12 animate-fade-up animate-fade-up-delay-2">
          We architect<br />
          the AI systems<br />
          that run your<br />
          <em className="italic text-stone block">business.</em>
        </h1>
        <p className="text-[14px] font-light leading-[1.9] text-taupe max-w-[380px] mb-14 animate-fade-up animate-fade-up-delay-3">
          You shouldn't be doing manually what a machine can do for you. We design, build, and maintain the AI operating system behind your business — so you can focus on growing it.
        </p>
        <div className="flex gap-7 items-center animate-fade-up animate-fade-up-delay-4">
          <Link
            to="/contact"
            className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-10 py-4 no-underline inline-block hover:bg-accent/90 hover:-translate-y-0.5 transition-all duration-300"
          >
            Start the Process
          </Link>
          <Link
            to="/services"
            className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
          >
            See What We Build
          </Link>
        </div>
      </div>

      <div className="relative flex flex-col justify-center px-8 md:pl-16 md:pr-[52px] pt-12 md:pt-[140px] pb-24 md:pb-[100px] z-[2]">
        <div className="grid grid-cols-2 grid-rows-2 gap-[2px] h-[480px]">
          {blueprintCells.map((cell) => (
            <div
              key={cell.num}
              className="bg-warm-white/[0.02] border border-warm-white/[0.06] p-7 md:p-8 flex flex-col justify-between transition-colors duration-400 hover:bg-accent/[0.08] hover:border-accent/30 relative overflow-hidden before:content-[''] before:absolute before:top-0 before:left-0 before:w-8 before:h-[2px] before:bg-accent before:opacity-60"
            >
              <div className="text-[10px] tracking-[0.25em] text-accent">{cell.num}</div>
              <div>
                <div className="font-serif text-[22px] font-light text-warm-white leading-[1.2] whitespace-pre-line">
                  {cell.title}
                </div>
                <div className="text-[11px] font-light text-taupe leading-[1.7] mt-3">{cell.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
