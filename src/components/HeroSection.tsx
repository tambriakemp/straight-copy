import heroCampaign from "@/assets/hero-campaign.jpg";
import heroEditorial from "@/assets/hero-editorial.jpg";
import heroLifestyle from "@/assets/hero-lifestyle.jpg";

const HeroSection = () => {
  return (
    <section className="min-h-screen grid grid-cols-1 md:grid-cols-2 relative overflow-hidden">
      <div className="bg-cream flex flex-col justify-end px-8 md:px-[52px] pt-[140px] pb-20 relative">
        <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-8 animate-fade-up animate-fade-up-delay-1">
          AI-Powered Brand Campaigns
        </p>
        <h1 className="font-serif text-[clamp(64px,8vw,112px)] font-light leading-[0.9] text-ink mb-12 animate-fade-up animate-fade-up-delay-2">
          Campaign<br />
          <em className="italic text-accent">Imagery</em><br />
          Reimagined.
        </h1>
        <p className="text-[13px] font-light leading-[1.8] text-taupe max-w-[320px] mb-14 animate-fade-up animate-fade-up-delay-3">
          Real skin. Real light. Undetectable. We create luxury-grade brand campaigns using AI — faster, more scalable, and indistinguishable from traditional production.
        </p>
        <div className="flex gap-6 items-center animate-fade-up animate-fade-up-delay-4">
          <a
            href="#contact"
            className="font-sans text-[11px] tracking-[0.2em] uppercase text-primary-foreground bg-ink px-10 py-4 no-underline inline-block hover:bg-accent hover:-translate-y-0.5 transition-all duration-300"
          >
            Start a Project
          </a>
          <a
            href="#work"
            className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
          >
            See Our Work
          </a>
        </div>
      </div>

      <div className="bg-mist-custom relative overflow-hidden hidden md:block">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[2px]">
          <div className="row-span-2 relative overflow-hidden">
            <img src={heroCampaign} alt="Campaign imagery" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-5 left-5 font-serif text-[11px] tracking-[0.2em] uppercase text-warm-white/70">Campaign</div>
          </div>
          <div className="relative overflow-hidden">
            <img src={heroEditorial} alt="Editorial imagery" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-5 left-5 font-serif text-[11px] tracking-[0.2em] uppercase text-warm-white/70">Editorial</div>
          </div>
          <div className="relative overflow-hidden">
            <img src={heroLifestyle} alt="Lifestyle imagery" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-5 left-5 font-serif text-[11px] tracking-[0.2em] uppercase text-warm-white/70">Lifestyle</div>
          </div>
        </div>
        <div className="absolute -right-5 top-1/2 -translate-y-1/2 rotate-90 text-[9px] tracking-[0.4em] uppercase text-taupe whitespace-nowrap">
          Real light · Real texture · AI crafted
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
