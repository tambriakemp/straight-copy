import { Link } from "react-router-dom";

const HeroSection = () => {
  return (
    <section
      className="min-h-screen bg-ink flex items-center relative overflow-hidden"
      style={{ padding: "160px 0 120px" }}
    >
      {/* CV watermark */}
      <div
        className="absolute font-serif font-light italic text-warm-white/[0.025] pointer-events-none leading-none select-none"
        style={{
          bottom: "-140px",
          right: "-80px",
          fontSize: "clamp(280px, 38vw, 520px)",
          letterSpacing: "-0.06em",
        }}
      >
        CV
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-7 md:px-16 relative z-[2]">
        <div className="max-w-[980px]">
          <p className="inline-flex items-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-10 animate-fade-up animate-fade-up-delay-1 before:content-[''] before:w-9 before:h-px before:bg-accent">
            AI Business Architecture
          </p>
          <h1
            className="font-serif font-light leading-[0.95] text-warm-white mb-14 animate-fade-up animate-fade-up-delay-2"
            style={{ fontSize: "clamp(64px, 9vw, 132px)", letterSpacing: "-0.01em" }}
          >
            We architect the AI systems that run your{" "}
            <em className="italic text-stone block">business.</em>
          </h1>
          <p className="text-[19px] font-light leading-[1.75] text-stone max-w-[640px] mb-16 animate-fade-up animate-fade-up-delay-3">
            You shouldn't be doing manually what a machine can do for you. We design, build, and maintain the AI operating system behind your business — so you can focus on growing it.
          </p>
          <div className="flex gap-9 items-center flex-wrap animate-fade-up animate-fade-up-delay-4">
            <Link
              to="/contact"
              className="font-sans text-[12px] font-medium tracking-[0.22em] uppercase text-warm-white bg-accent px-11 py-5 no-underline inline-block hover:bg-accent/90 hover:-translate-y-0.5 transition-all duration-300"
            >
              Start the Process
            </Link>
            <Link
              to="/services"
              className="font-sans text-[12px] font-medium tracking-[0.22em] uppercase text-stone no-underline inline-flex items-center gap-3 hover:gap-[18px] hover:text-accent transition-all duration-300 after:content-['→'] after:text-[14px]"
            >
              See What We Build
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
