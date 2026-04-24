import { Link } from "react-router-dom";

const ContactSection = () => {
  return (
    <section id="contact" className="py-[160px] px-8 md:px-[52px] bg-ink text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[140px] md:text-[200px] font-light text-warm-white/[0.02] whitespace-nowrap pointer-events-none leading-none select-none">
        ARCHITECT
      </div>
      <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-8 reveal relative">Ready to Build</p>
      <h2 className="font-serif text-[clamp(48px,6.5vw,96px)] font-light text-warm-white leading-[0.92] mb-14 relative reveal">
        Stop running your<br />
        business manually.<br />
        <em className="italic text-stone">Architect it.</em>
      </h2>
      <div className="flex flex-col sm:flex-row justify-center gap-7 items-center reveal relative">
        <Link
          to="/contact"
          className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-10 py-4 no-underline inline-block hover:bg-accent/90 hover:-translate-y-0.5 transition-all duration-300"
        >
          Start the Architecture
        </Link>
        <Link
          to="/services"
          className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
        >
          See What We Build
        </Link>
      </div>
    </section>
  );
};

export default ContactSection;
