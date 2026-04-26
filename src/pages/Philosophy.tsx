import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

const pillars = [
  {
    num: "01",
    title: "<em>Systems</em><br/>over hustle",
    body: "Hustle is not a business strategy. Working harder on the wrong things is still the wrong things. We believe in building intelligent systems that produce consistent results — not in grinding harder to compensate for the absence of structure.",
  },
  {
    num: "02",
    title: "<em>Ownership</em><br/>over dependency",
    body: "Everything we build is yours. On your accounts, documented, and fully transferable. We don't believe in creating dependency on our platform or our access. We believe in building something so valuable inside your business that you wouldn't want to leave — not something you can't leave.",
  },
  {
    num: "03",
    title: "<em>Intelligence</em><br/>that compounds",
    body: "The best AI systems don't stay static. They get smarter over time as they learn more about the business, the voice, the customer, and the patterns. Every month we spend with a client makes their system more accurate, more useful, and more irreplaceable. That's the architecture at work.",
  },
  {
    num: "04",
    title: "<em>Access</em><br/>for every business",
    body: "Sophisticated AI systems used to be reserved for businesses with enterprise budgets and in-house technical teams. We've changed that. Whether you're a solo founder just getting started or a growing team ready to scale — you deserve infrastructure that works as hard as you do.",
  },
];

const stats = [
  { num: "2", label: "Core automations every client gets" },
  { num: "3", label: "Monthly deliverables that compound" },
  { num: "0", label: "Tech knowledge required from you" },
  { num: "∞", label: "The system has no ceiling" },
];

const ethicsItems = [
  {
    title: "We design before we build",
    body: "Every AI OS we architect starts with a thorough understanding of your business — your voice, your customer, your workflows, your goals. We don't touch a tool until we understand what we're building and why. The onboarding conversation isn't a formality. It's the foundation everything else is built on.",
  },
  {
    title: "We're transparent about what AI can and can't do",
    body: "AI is not magic. It's a powerful tool that works exceptionally well when it's set up correctly and maintained consistently. We're honest with every client about what to expect, what takes time to optimize, and what still requires a human touch. We don't oversell and underdeliver.",
  },
  {
    title: "We stay ahead so you don't have to",
    body: "AI is moving faster than any one business owner can track. New tools, new capabilities, new integrations — the landscape shifts constantly. Part of what you're paying for every month is someone who stays on top of that movement and translates it into specific, actionable improvements for your system. You focus on your business. We focus on making it smarter.",
  },
  {
    title: "We build for your voice, not a generic one",
    body: "The biggest failure of most AI implementations is that they sound like AI. Generic, hollow, obviously automated. Every system we build is trained on your actual words, your actual tone, your actual way of communicating. Your customers shouldn't be able to tell the difference. That's the standard we hold ourselves to.",
  },
  {
    title: "We measure success by your results — not our activity",
    body: "We don't count deliverables to justify our fee. We measure whether the system is working — whether leads are converting, content is performing, and manual tasks are genuinely off your plate. If something isn't working, we rebuild it. The goal is a business that runs better. Everything else is just a means to that end.",
  },
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
        <Navbar variant="dark" />

        {/* Hero */}
        <section className="pt-[180px] pb-[100px] bg-ink flex flex-col justify-end px-8 md:px-[52px] relative overflow-hidden min-h-screen">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif font-light italic text-warm-white/[0.04] whitespace-nowrap pointer-events-none leading-none"
            style={{ fontSize: "clamp(180px, 22vw, 340px)", letterSpacing: "-0.02em" }}
          >
            Architect.
          </div>
          <div className="absolute top-0 bottom-0 left-8 md:left-[52px] w-px bg-gradient-to-b from-transparent via-accent to-transparent opacity-40" />
          <p className="text-[11px] tracking-[0.35em] uppercase text-taupe mb-7 pl-6 animate-fade-up animate-fade-up-delay-1 relative">
            Our Philosophy
          </p>
          <h1 className="font-serif text-[clamp(60px,9vw,130px)] font-light leading-[0.88] text-warm-white pl-6 animate-fade-up animate-fade-up-delay-2 relative">
            We believe your<br />
            business should<br />
            <em className="italic text-stone block">run without you.</em>
          </h1>
          <div className="absolute bottom-12 right-8 md:right-[52px] flex flex-col items-center gap-3 animate-fade-up" style={{ animationDelay: "1s" }}>
            <div className="w-px h-[60px] bg-gradient-to-b from-accent to-transparent animate-pulse" />
            <span className="text-[9px] tracking-[0.3em] uppercase text-taupe [writing-mode:vertical-rl]">Scroll</span>
          </div>
        </section>

        {/* Opening Statement */}
        <section className="bg-cream py-[140px] px-8 md:px-[52px] grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center">
          <div className="reveal">
            <blockquote className="font-serif text-[clamp(32px,3.8vw,52px)] font-light leading-[1.2] text-ink">
              "You didn't start a business to spend your days doing tasks a machine could handle. <em className="italic text-accent">You started it to build something that matters.</em>"
            </blockquote>
            <p className="text-[11px] tracking-[0.2em] uppercase text-taupe mt-8">— Cre8 Visions</p>
          </div>
          <div className="reveal reveal-delay-1">
            <p className="text-[11px] tracking-[0.35em] uppercase text-accent mb-6">Where We Come From</p>
            <p className="text-[15px] font-light leading-[1.95] text-charcoal mb-5">
              We've watched talented, driven business owners burn out not from lack of vision — but from the weight of doing everything manually. Responding to every lead. Writing every post. Following up with every client. Repeating the same tasks week after week with no system underneath them.
            </p>
            <p className="text-[15px] font-light leading-[1.95] text-charcoal mb-5">
              AI changed what's possible. Not by replacing the human behind the business — but by removing every repetitive, automatable task that was standing between that human and the work that actually moves the needle.
            </p>
            <p className="text-[15px] font-light leading-[1.95] text-charcoal">
              We're not here to sell you tools. We're here to architect the system that makes your business run — whether you're there or not.
            </p>
          </div>
        </section>

        {/* Pillars */}
        <section className="bg-ink py-[140px] px-8 md:px-[52px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 border-b border-warm-white/[0.07] pb-10 reveal">
            <div>
              <p className="text-[11px] tracking-[0.35em] uppercase text-taupe mb-4">What We Stand For</p>
              <h2 className="font-serif text-[clamp(40px,5vw,64px)] font-light text-warm-white leading-none">
                Our <em className="italic">Pillars</em>
              </h2>
            </div>
            <p className="text-[14px] font-light text-taupe max-w-[380px] leading-[1.8] mt-6 md:mt-0">
              Four beliefs that shape every system we build — and every decision we make about how to build it.
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
                <p className="text-[15px] font-light leading-[1.85] text-taupe">{p.body}</p>
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
            <p className="text-[11px] tracking-[0.35em] uppercase text-taupe mb-12 reveal">Our Manifesto</p>
            <p className="font-serif text-[clamp(26px,3.2vw,44px)] font-light leading-[1.4] text-ink mb-6 reveal">
              The future of business is not about <em className="italic text-accent">working more</em> — it's about building systems intelligent enough to work when you're not.
            </p>
            <div className="w-12 h-px bg-accent mx-auto my-12 reveal" />
            <p className="font-serif text-[clamp(26px,3.2vw,44px)] font-light leading-[1.4] text-ink mb-6 reveal">
              We are <em className="italic text-accent">architects, not vendors.</em> Every system we build begins with understanding — your voice, your business, your customer, your goals. AI executes. We design.
            </p>
            <div className="w-12 h-px bg-accent mx-auto my-12 reveal" />
            <p className="font-serif text-[clamp(26px,3.2vw,44px)] font-light leading-[1.4] text-ink mb-6 reveal">
              The businesses that <em className="italic text-accent">win the next decade</em> won't be the ones that worked the hardest. They'll be the ones that built the smartest infrastructure underneath the work.
            </p>
            <div className="w-12 h-px bg-accent mx-auto my-12 reveal" />
            <p className="text-[15px] font-light leading-[1.9] text-taupe max-w-[560px] mx-auto reveal">
              That infrastructure is what we build. One business at a time. One system at a time. Getting smarter every single month.
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

        {/* How We Approach AI */}
        <section className="bg-background py-[140px] px-8 md:px-[52px] grid grid-cols-1 md:grid-cols-[320px_1fr] gap-16 md:gap-[100px] items-start">
          <div className="reveal">
            <p className="text-[11px] tracking-[0.35em] uppercase text-taupe mb-6">How We Work</p>
            <h2 className="font-serif text-[clamp(36px,4vw,52px)] font-light text-ink leading-[1.1] md:sticky md:top-[120px]">
              Our <em className="italic">Approach</em><br />to AI
            </h2>
          </div>
          <div>
            {ethicsItems.map((item, i) => (
              <div key={i} className={`py-10 ${i < ethicsItems.length - 1 ? "border-b border-mist-custom" : ""} ${i === 0 ? "pt-0" : ""} reveal`}>
                <div className="font-serif text-2xl font-light text-ink mb-3.5 flex items-center gap-4">
                  <span className="text-accent text-xs flex-shrink-0">✦</span>
                  {item.title}
                </div>
                <p className="text-[15px] font-light leading-[1.9] text-taupe">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-ink py-[140px] px-8 md:px-[52px] text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[200px] md:text-[260px] font-light italic text-warm-white/[0.025] whitespace-nowrap pointer-events-none">
            THINK.
          </div>
          <p className="text-[11px] tracking-[0.35em] uppercase text-taupe mb-8 relative reveal">The Architecture Starts Here</p>
          <h2 className="font-serif text-[clamp(48px,6.5vw,96px)] font-light text-warm-white leading-[0.95] mb-14 relative reveal">
            Same belief.<br />
            Different business.<br />
            <em className="italic text-stone">Every time.</em>
          </h2>
          <div className="flex justify-center gap-6 items-center relative reveal flex-wrap">
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-10 py-4 no-underline inline-block hover:bg-[#9B8265] hover:-translate-y-0.5 transition-all duration-300"
            >
              Start the Architecture
            </Link>
            <Link
              to="/services"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-warm-white transition-all duration-300 after:content-['→']"
            >
              See what we build
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default PhilosophyPage;
