import { Link } from "react-router-dom";

const ContactSection = () => {
  return (
    <section
      id="contact"
      className="py-[140px] md:py-[180px] bg-ink text-center relative overflow-hidden"
    >
      {/* ARCHITECT watermark */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif font-light text-warm-white/[0.02] whitespace-nowrap pointer-events-none leading-none select-none"
        style={{ fontSize: "clamp(120px, 20vw, 260px)" }}
      >
        ARCHITECT
      </div>

      <div className="max-w-[1400px] mx-auto px-7 md:px-16 relative">
        <p className="inline-flex items-center justify-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-10 reveal before:content-[''] before:w-9 before:h-px before:bg-accent after:content-[''] after:w-9 after:h-px after:bg-accent">
          Ready to Build
        </p>
        <h2
          className="font-serif font-light text-warm-white leading-[0.95] mb-16 reveal"
          style={{ fontSize: "clamp(56px, 7vw, 108px)", letterSpacing: "-0.01em" }}
        >
          Stop running your business manually.{" "}
          <em className="italic text-stone">Architect it.</em>
        </h2>
        <div className="flex flex-col sm:flex-row justify-center gap-9 items-center reveal">
          <Link
            to="/contact"
            className="font-sans text-[12px] font-medium tracking-[0.22em] uppercase text-warm-white bg-accent px-11 py-5 no-underline inline-block hover:bg-accent/90 hover:-translate-y-0.5 transition-all duration-300"
          >
            Start the Architecture
          </Link>
          <Link
            to="/services"
            className="font-sans text-[12px] font-medium tracking-[0.22em] uppercase text-stone no-underline inline-flex items-center gap-3 hover:gap-[18px] hover:text-accent transition-all duration-300 after:content-['→'] after:text-[14px]"
          >
            See What We Build
          </Link>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
