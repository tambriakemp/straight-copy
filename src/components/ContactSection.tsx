const ContactSection = () => {
  return (
    <section id="contact" className="py-[140px] px-8 md:px-[52px] bg-ink text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[180px] md:text-[280px] font-light text-warm-white/[0.02] whitespace-nowrap pointer-events-none leading-none">
        CRE8
      </div>
      <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-8 reveal">Ready When You Are</p>
      <h2 className="font-serif text-[clamp(52px,7vw,100px)] font-light text-warm-white leading-[0.95] mb-14 relative reveal">
        Let's Build<br />
        Something <em className="italic text-stone">Real.</em>
      </h2>
      <a
        href="mailto:hello@cre8visions.com"
        className="font-serif text-lg font-light italic text-stone no-underline tracking-[0.05em] border-b border-warm-white/20 pb-1 hover:text-warm-white hover:border-accent transition-colors duration-300 inline-block mb-16 reveal"
      >
        hello@cre8visions.com
      </a>
      <div className="flex justify-center gap-6 reveal">
        <a
          href="mailto:hello@cre8visions.com"
          className="font-sans text-[11px] tracking-[0.2em] uppercase text-primary-foreground bg-warm-white px-10 py-4 no-underline inline-block hover:bg-accent hover:text-warm-white hover:-translate-y-0.5 transition-all duration-300"
        >
          Start a Campaign
        </a>
        <a
          href="#services"
          className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
        >
          Explore Services
        </a>
      </div>
    </section>
  );
};

export default ContactSection;
