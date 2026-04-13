import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";

const services = [
  {
    num: "01",
    title: ["AI Brand", "Campaigns"],
    tags: ["Campaign", "Editorial", "Social", "E-Commerce"],
    desc: "High-fashion, photorealistic campaign imagery produced entirely with AI. We direct every shot — lighting, skin texture, wardrobe, setting — with the same precision as a traditional shoot, at a fraction of the cost and in days, not weeks. Most people can't tell the difference. That's the point.",
    includes: [
      "Full creative direction & concept development",
      "AI-generated campaign imagery (lifestyle, editorial, product)",
      "Skin texture, natural lighting, real-world environments",
      "Multiple model aesthetics & skin tones available",
      "Final assets delivered in all required formats & sizes",
      "Unlimited revision rounds on approved concepts",
    ],
  },
  {
    num: "02",
    title: ["Editorial", "Lifestyle"],
    tags: ["Lifestyle", "UGC-Style", "Wellness", "Fashion"],
    desc: "Scroll-stopping lifestyle content that feels candid, real, and on-trend. Whether it's a matcha moment, a morning routine, or an activewear flat lay — we craft images that perform on social, convert on product pages, and build brand world effortlessly.",
    includes: [
      "Lifestyle & UGC-style AI imagery",
      "Custom scene-building (café, studio, outdoor, home)",
      "Prop, wardrobe & aesthetic direction",
      "Platform-optimized formats (Instagram, TikTok, Pinterest)",
      "Content calendar batching available",
    ],
  },
  {
    num: "03",
    title: ["Short-Form", "Video Content"],
    tags: ["Reels", "TikTok", "Stories", "Ads"],
    desc: "Scroll-stopping short-form video built for the platforms that move culture — Instagram Reels, TikTok, YouTube Shorts, and paid social ads. We combine AI-generated visuals, motion, and editorial pacing to produce video content that feels premium, performs on algorithm, and stays true to your brand aesthetic.",
    includes: [
      "AI-assisted short-form video (5–60 seconds)",
      "Reels, TikToks, YouTube Shorts & paid ad formats",
      "Motion graphics, transitions & text overlays",
      "Sound design & music licensing guidance",
      "Platform-optimized aspect ratios (9:16, 1:1, 16:9)",
      "Monthly content batch packages available",
    ],
  },
  {
    num: "04",
    title: ["AI Product", "Visualization"],
    tags: ["Product", "E-Commerce", "Packshot", "Lifestyle"],
    desc: "Your product, placed perfectly — in any scene, any setting, any aesthetic. We create AI-generated product imagery that looks like it was shot in a world-class studio, from clean packshots to full lifestyle context shots. Perfect for e-commerce, launch campaigns, and retail assets.",
    includes: [
      "Clean packshot & hero product imagery",
      "Lifestyle context shots (hands, surfaces, scenes)",
      "Multiple colorway & variant rendering",
      "360° product angle sets",
      "E-commerce optimized formats & sizing",
      "Seasonal & campaign refresh packages",
    ],
  },
];

const pricing = [
  {
    label: "Starter",
    tier: "Launch",
    sub: "For emerging brands ready to level up",
    items: ["10 AI campaign images", "2 creative concepts", "1 short-form video (30s)", "1 round of revisions", "5-day turnaround"],
    featured: false,
    cta: { text: "Get started", style: "ghost" },
  },
  {
    label: "Most Popular",
    tier: "Campaign",
    sub: "For brands ready to run full campaigns",
    items: ["30 AI campaign images", "Full creative direction", "3 short-form videos (up to 60s)", "Product visualization set", "Unlimited revisions", "Priority 3-day turnaround"],
    featured: true,
    cta: { text: "Start a campaign", style: "primary" },
  },
  {
    label: "Enterprise",
    tier: "Retainer",
    sub: "For brands scaling content at volume",
    items: ["Unlimited monthly imagery", "Weekly short-form video drops", "Product visualization on demand", "Dedicated creative team", "Brand style system maintained", "Custom SLA & delivery"],
    featured: false,
    cta: { text: "Let's talk", style: "ghost" },
  },
];

const Services = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none">
        <Navbar />

        {/* Hero */}
        <section className="pt-[180px] pb-[100px] px-8 md:px-[52px] bg-cream grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end relative overflow-hidden">
          <div className="absolute -bottom-10 -right-5 font-serif text-[200px] font-light text-foreground/[0.04] pointer-events-none leading-none whitespace-nowrap">
            SERVICES
          </div>
          <div>
            <p className="text-[11px] tracking-[0.35em] uppercase text-charcoal mb-6 animate-fade-up">What We Offer</p>
            <h1 className="font-serif text-[clamp(56px,7vw,100px)] font-light leading-[0.9] text-foreground animate-fade-up animate-fade-up-delay-1">
              Our<br /><em className="italic text-accent">Services</em>
            </h1>
          </div>
          <p className="text-sm font-light leading-[1.9] text-taupe max-w-[440px] self-end animate-fade-up animate-fade-up-delay-2">
            We've built a new kind of creative studio — one that collapses the gap between concept and campaign-ready content. Every service is designed to give brands more speed, more scale, and more precision than traditional production ever could.
          </p>
        </section>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-accent to-transparent mx-8 md:mx-[52px]" />

        {/* Service Rows */}
        <div className="px-8 md:px-[52px] pb-[120px]">
          {services.map((s) => (
            <div
              key={s.num}
              className="grid grid-cols-1 md:grid-cols-[80px_1fr_1fr] gap-6 md:gap-0 border-b border-mist py-12 md:py-[72px] items-start service-row-hover reveal transition-colors duration-300 hover:bg-cream md:hover:-mx-[52px] md:hover:px-[52px]"
            >
              <div className="font-serif text-[18px] tracking-[0.15em] text-taupe pt-1.5">{s.num}</div>
              <div>
                <div className="font-serif text-[clamp(32px,4vw,52px)] font-light leading-[1.05] text-foreground mb-5">
                  {s.title[0]}<br /><em className="italic">{s.title[1]}</em>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.tags.map((tag) => (
                    <span key={tag} className="text-[11px] tracking-[0.2em] uppercase text-charcoal border border-sand px-3.5 py-1.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="md:pl-[60px]">
                <p className="text-[13px] font-light leading-[1.9] text-taupe mb-8">{s.desc}</p>
                <ul className="list-none">
                  {s.includes.map((item) => (
                    <li key={item} className="text-xs font-light text-charcoal py-2.5 border-t border-mist flex items-center gap-3 tracking-[0.05em]">
                      <span className="text-accent text-[11px]">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="bg-ink px-8 md:px-[52px] py-[100px] grid grid-cols-1 md:grid-cols-3 gap-0.5">
          {pricing.map((p, i) => (
            <div
              key={p.tier}
              className={`p-10 md:p-14 relative transition-colors duration-300 reveal ${i === 0 ? "" : i === 1 ? "reveal-delay-1" : "reveal-delay-2"} ${
                p.featured
                  ? "bg-accent hover:bg-accent/90"
                  : "bg-charcoal hover:bg-[#221F1C]"
              }`}
            >
              <div className={`text-[11px] tracking-[0.3em] uppercase mb-8 ${p.featured ? "text-white/70" : "text-stone"}`}>
                {p.label}
              </div>
              <div className="font-serif text-4xl font-light text-warm-white mb-2">{p.tier}</div>
              <div className={`text-xs mb-10 font-light ${p.featured ? "text-white/60" : "text-taupe"}`}>
                {p.sub}
              </div>
              <ul className="list-none">
                {p.items.map((item) => (
                  <li
                    key={item}
                    className={`text-xs font-light py-2.5 border-t flex gap-2.5 ${
                      p.featured
                        ? "text-white/85 border-t-white/15"
                        : "text-stone border-t-white/[0.06]"
                    }`}
                  >
                    <span className={p.featured ? "text-white/50" : "text-accent"}>·</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-12">
                {p.cta.style === "primary" ? (
                  <Link
                    to="/contact"
                    className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-ink px-10 py-4 no-underline inline-block hover:bg-foreground hover:-translate-y-0.5 transition-all duration-300"
                  >
                    {p.cta.text}
                  </Link>
                ) : (
                  <Link
                    to="/contact"
                    className={`font-sans text-[11px] tracking-[0.2em] uppercase no-underline flex items-center gap-2.5 hover:gap-4 transition-all duration-300 after:content-['→'] ${
                      p.featured ? "text-white/80 hover:text-warm-white" : "text-stone hover:text-warm-white"
                    }`}
                  >
                    {p.cta.text}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Strip */}
        <section className="py-[120px] px-8 md:px-[52px] text-center bg-cream">
          <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light text-foreground mb-4 reveal">
            Not sure where<br />to <em className="italic text-accent">start?</em>
          </h2>
          <p className="text-[13px] font-light text-taupe mb-12 reveal">
            Tell us about your brand. We'll recommend the right approach.
          </p>
          <div className="flex justify-center gap-6 items-center reveal">
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-ink px-10 py-4 no-underline inline-block hover:bg-accent hover:-translate-y-0.5 transition-all duration-300"
            >
              Book a Free Consult
            </Link>
            <Link
              to="/work"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
            >
              See Our Work
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default Services;
