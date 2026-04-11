const services = [
  { num: "01", title: "AI Brand\nCampaigns", desc: "High-fashion, photorealistic campaign imagery produced entirely with AI. Indistinguishable from traditional shoots — at a fraction of the cost and timeline." },
  { num: "02", title: "Editorial\nLifestyle", desc: "Real skin texture. Real light. AI-crafted lifestyle content designed to perform across social, e-commerce, and brand storytelling." },
  { num: "03", title: "Brand Identity\n& Logos", desc: "Visual identity systems built to last. From wordmarks to full brand guidelines, we create cohesive identities with editorial precision." },
  { num: "04", title: "Web\nDevelopment", desc: "Conversion-focused websites designed to match your brand's ambition. Custom builds with luxury-grade attention to detail." },
];

const ServicesSection = () => {
  return (
    <section id="services" className="py-[140px] px-8 md:px-[52px] grid grid-cols-1 md:grid-cols-[220px_1fr] gap-10 md:gap-20">
      <div className="hidden md:flex flex-col justify-between items-start relative pt-2">
        <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-accent to-transparent" />
        <p className="text-[10px] tracking-[0.35em] uppercase text-taupe [writing-mode:vertical-rl] h-fit pl-6">
          What We Do
        </p>
        <div className="font-serif text-[clamp(80px,10vw,140px)] font-light italic leading-[0.85] text-mist-custom [writing-mode:vertical-rl] rotate-180 tracking-tight pl-6 pointer-events-none select-none">
          Cre8
        </div>
        <p className="[writing-mode:vertical-rl] rotate-180 text-[10px] tracking-[0.3em] uppercase text-accent pl-6 whitespace-nowrap">
          AI · Brand · Vision
        </p>
      </div>
      <div>
        <div className="w-12 h-px bg-accent mb-8 reveal" />
        <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light leading-none text-ink mb-12 reveal">
          Our <em className="italic">Services</em>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px]">
          {services.map((s, i) => (
            <div
              key={s.num}
              className={`service-card bg-cream p-10 md:p-[52px_40px] relative overflow-hidden transition-colors duration-400 group hover:bg-ink reveal ${i > 0 ? `reveal-delay-${i}` : ""}`}
            >
              <div className="font-serif text-[11px] tracking-[0.2em] text-taupe mb-8 transition-colors duration-400 group-hover:text-stone">
                {s.num}
              </div>
              <div className="font-serif text-[32px] font-light leading-[1.1] text-ink mb-5 transition-colors duration-400 group-hover:text-warm-white whitespace-pre-line">
                {s.title}
              </div>
              <div className="text-[12px] font-light leading-[1.8] text-taupe transition-colors duration-400 group-hover:text-stone">
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
