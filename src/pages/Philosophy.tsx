import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";
import Footer from "@/components/Footer";

const pillars = [
  { num: "01", title: "<em>Authenticity</em><br/>over polish", body: "Perfect is forgettable. We chase images that feel lived-in — real pores, real light, real moments. Our AI campaigns are designed to look like someone caught something genuine, not staged it. Because that's what stops a scroll." },
  { num: "02", title: "<em>Speed</em><br/>without compromise", body: "Brands move fast. Content calendars don't wait. We've collapsed the weeks-long production cycle into days — without sacrificing a single pixel of quality. When your campaign needs to be live, we make sure it is." },
  { num: "03", title: "<em>Access</em><br/>for every brand", body: "High-fashion campaign imagery used to be reserved for brands with six-figure production budgets. We've changed that. Whether you're a startup or a scaling brand, you deserve content that competes with the biggest names in your space." },
  { num: "04", title: "<em>Precision</em><br/>in every detail", body: "We don't generate and send. Every image is art-directed, curated, and reviewed against your brief before it ever reaches you. We treat AI as a tool — and great tools are only as good as the hands that guide them." },
];

const stats = [
  { num: "10×", label: "Faster than traditional shoots" },
  { num: "80%", label: "Lower cost vs. production" },
  { num: "∞", label: "Scalable content volume" },
  { num: "100%", label: "Brand-accurate every time" },
];

const ethicsItems = [
  { title: "We are transparent with every client", body: "Every brand we work with knows exactly how their content is created. We never misrepresent our process. AI-generated is a feature of our work, not a disclaimer — because the quality speaks for itself." },
  { title: "We lead with creative direction, always", body: "We don't type a prompt and call it a campaign. Every image begins with a brief, a mood board, a creative strategy, and human direction at every step. AI executes — we decide." },
  { title: "We celebrate diversity and representation", body: "One of AI's most powerful gifts to visual storytelling is access to representation that traditional casting often missed. We actively direct for diversity in every campaign — across skin tones, body types, and aesthetics." },
  { title: "We are committed to responsible use", body: "We do not create deceptive imagery, impersonate real individuals, or produce content designed to mislead. Our work is brand storytelling — honest, intentional, and created with care." },
];

const PhilosophyPage = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none">
        {/* Nav - dark variant */}
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 md:px-[52px] py-7 bg-ink/[0.92] backdrop-blur-[12px] border-b border-warm-white/5">
          <Link to="/" className="font-serif text-lg font-light tracking-[0.25em] uppercase text-warm-white no-underline">
            Cre8 Visions
          </Link>
          <ul className="hidden md:flex gap-10 list-none">
            {[
              { name: "Services", path: "/services" },
              { name: "Work", path: "/work" },
              { name: "Philosophy", path: "/philosophy" },
              { name: "Contact", path: "/contact" },
            ].map((item) => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className={`font-sans text-[11px] font-normal tracking-[0.2em] uppercase no-underline transition-colors duration-300 ${
                    item.name === "Philosophy" ? "text-accent" : "text-stone hover:text-accent"
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Hero */}
        <section className="pt-[180px] pb-[100px] bg-ink flex flex-col justify-end px-8 md:px-[52px] relative overflow-hidden">
          <div className="absolute -bottom-10 -right-5 font-serif text-[clamp(180px,22vw,340px)] font-light italic text-warm-white/[0.04] whitespace-nowrap pointer-events-none leading-none tracking-tight">
            Believe.
          </div>
          <div className="absolute top-0 bottom-0 left-8 md:left-[52px] w-px bg-gradient-to-b from-transparent via-accent to-transparent opacity-40" />
          <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-7 pl-6 animate-fade-up animate-fade-up-delay-1">
            Our Philosophy
          </p>
          <h1 className="font-serif text-[clamp(60px,9vw,130px)] font-light leading-[0.88] text-warm-white pl-6 animate-fade-up animate-fade-up-delay-2">
            We believe in<br />
            <em className="italic text-stone block">what's real.</em>
          </h1>
          <div className="absolute bottom-12 right-8 md:right-[52px] flex flex-col items-center gap-3 animate-fade-up" style={{ animationDelay: "1s" }}>
            <div className="w-px h-[60px] bg-gradient-to-b from-accent to-transparent animate-pulse" />
            <span className="text-[9px] tracking-[0.3em] uppercase text-taupe [writing-mode:vertical-rl]">Scroll</span>
          </div>
        </section>

        {/* Opening Statement */}
        <section className="bg-cream py-[140px] px-8 md:px-[52px] grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center">
          <div className="reveal">
            <blockquote className="font-serif text-[clamp(36px,4vw,58px)] font-light leading-[1.15] text-ink">
              "The best campaign image is the one that makes someone feel something — <em className="italic text-accent">not the one that cost the most to make.</em>"
            </blockquote>
            <p className="text-[11px] tracking-[0.2em] uppercase text-taupe mt-8">— Cre8 Visions</p>
          </div>
          <div className="reveal reveal-delay-1">
            <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-6">Where We Come From</p>
            <p className="text-sm font-light leading-[1.95] text-charcoal mb-5">
              We started Cre8 Visions because we watched brands overpay for content that underperformed. Studios. Crews. Travel. Models. Weeks of back-and-forth — all for images that could have been produced better, faster, and for a fraction of the cost.
            </p>
            <p className="text-sm font-light leading-[1.95] text-charcoal mb-5">
              AI changed everything. Not by replacing creativity — but by removing every barrier between a great idea and a great image. We provide the creative direction, the vision, the taste. AI provides the execution at a scale that was never before possible.
            </p>
            <p className="text-sm font-light leading-[1.95] text-charcoal">
              The result? Campaign-grade imagery that is indistinguishable from a traditional shoot. Real skin. Real light. Real texture. No studio required.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section className="bg-ink py-[140px] px-8 md:px-[52px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 border-b border-warm-white/[0.07] pb-10 reveal">
            <div>
              <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-4">What We Stand For</p>
              <h2 className="font-serif text-[clamp(40px,5vw,64px)] font-light text-warm-white leading-none">
                Our <em className="italic">Pillars</em>
              </h2>
            </div>
            <p className="text-[13px] font-light text-taupe max-w-[380px] leading-[1.8] mt-6 md:mt-0">
              Four principles that shape every project we take on — from a single logo to a full campaign rollout.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px]">
            {pillars.map((p, i) => (
              <div
                key={p.num}
                className={`pillar-card p-10 md:p-16 bg-charcoal relative overflow-hidden transition-colors duration-400 group hover:bg-[#221F1C] reveal ${i > 0 ? `reveal-delay-${Math.min(i, 3)}` : ""}`}
              >
                <div className="absolute top-0 left-0 w-[3px] h-full bg-accent origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-500" />
                <div className="font-serif text-[11px] tracking-[0.2em] text-taupe mb-7">{p.num}</div>
                <div
                  className="font-serif text-[36px] font-light text-warm-white mb-5 leading-[1.1] [&>em]:italic"
                  dangerouslySetInnerHTML={{ __html: p.title }}
                />
                <p className="text-[13px] font-light leading-[1.85] text-taupe">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Manifesto */}
        <section className="bg-cream py-[160px] px-8 md:px-[52px] relative overflow-hidden">
          <div className="absolute top-10 left-9 font-serif text-[280px] md:text-[360px] font-light text-ink/[0.04] leading-none pointer-events-none select-none">
            "
          </div>
          <div className="max-w-[900px] mx-auto text-center relative">
            <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-12 reveal">Our Manifesto</p>
            <p className="font-serif text-[clamp(28px,3.5vw,48px)] font-light leading-[1.4] text-ink mb-6 reveal">
              The future of brand content is not about <em className="italic text-accent">less human creativity</em> — it's about removing every obstacle that stood between a creative idea and the world seeing it.
            </p>
            <div className="w-12 h-px bg-accent mx-auto my-12 reveal" />
            <p className="font-serif text-[clamp(28px,3.5vw,48px)] font-light leading-[1.4] text-ink mb-6 reveal">
              We are <em className="italic text-accent">directors, not generators.</em> Every image we create begins with intention — a feeling, a story, a truth about your brand that we translate into visuals the world can feel.
            </p>
            <div className="w-12 h-px bg-accent mx-auto my-12 reveal" />
            <p className="text-[13px] font-light leading-[1.9] text-taupe max-w-[560px] mx-auto reveal">
              AI is our medium, not our message. The message is your brand. And we will make it look exactly as extraordinary as it deserves to.
            </p>
          </div>
        </section>

        {/* Stats Strip */}
        <div className="bg-accent py-20 px-8 md:px-[52px] grid grid-cols-2 md:grid-cols-4 gap-[2px]">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`px-6 md:px-10 ${i > 0 ? "border-l border-warm-white/20" : ""} ${i === 2 ? "md:border-l border-l-0 mt-8 md:mt-0" : ""} reveal ${i > 0 ? `reveal-delay-${Math.min(i, 3)}` : ""}`}
            >
              <div className="font-serif text-[48px] md:text-[64px] font-light text-warm-white leading-none mb-2">{s.num}</div>
              <div className="text-[11px] tracking-[0.15em] uppercase text-warm-white/[0.65]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* AI Ethics */}
        <section className="bg-background py-[140px] px-8 md:px-[52px] grid grid-cols-1 md:grid-cols-[320px_1fr] gap-16 md:gap-[100px] items-start">
          <div className="reveal">
            <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-6">Transparency</p>
            <h2 className="font-serif text-[clamp(36px,4vw,52px)] font-light text-ink leading-[1.1] md:sticky md:top-[120px]">
              Our <em className="italic">Approach</em> to AI
            </h2>
          </div>
          <div>
            {ethicsItems.map((item, i) => (
              <div key={i} className={`py-10 ${i < ethicsItems.length - 1 ? "border-b border-mist-custom" : ""} ${i === 0 ? "pt-0" : ""} reveal`}>
                <div className="font-serif text-2xl font-light text-ink mb-3.5 flex items-center gap-4">
                  <span className="text-accent text-xs flex-shrink-0">✦</span>
                  {item.title}
                </div>
                <p className="text-[13px] font-light leading-[1.9] text-taupe">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-ink py-[140px] px-8 md:px-[52px] text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[200px] md:text-[260px] font-light italic text-warm-white/[0.025] whitespace-nowrap pointer-events-none">
            REAL.
          </div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-8 relative reveal">Ready to See It in Action?</p>
          <h2 className="font-serif text-[clamp(52px,7vw,96px)] font-light text-warm-white leading-[0.95] mb-14 relative reveal">
            Same vision.<br />
            <em className="italic text-stone">Better results.</em>
          </h2>
          <div className="flex justify-center gap-6 items-center relative reveal">
             <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-10 py-4 no-underline inline-block hover:bg-[#9B8265] hover:-translate-y-0.5 transition-all duration-300"
            >
              Start a Project
            </Link>
            <Link
              to="/work"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-warm-white transition-all duration-300 after:content-['→']"
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

export default PhilosophyPage;
