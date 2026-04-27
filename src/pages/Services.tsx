import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";

const pricingTiers = [
  {
    label: "Starter",
    name: "Launch",
    price: "$497 / month",
    includesLabel: "What's included",
    items: [
      "Both core automations built and running",
      "Brand voice document + AI assistant setup",
      "Monthly AI assistant update",
      "Monthly content prompt refresh",
      "Monthly strategy briefing",
      "Async support",
    ],
    cta: "Start with Launch",
    featured: false,
    href: "https://app.cre8visions.com/checkout/?line_items%5B0%5D%5Bprice_id%5D=4e9d2ca6-2011-4541-9a45-b02291d76abf&line_items%5B0%5D%5Bquantity%5D=1",
  },
  {
    label: "Most Popular",
    name: "Growth",
    price: "$997 / month",
    includesLabel: "Everything in Launch, plus",
    items: [
      "Full Business Brain setup — your complete AI Project with base artifacts and skill files",
      "Brand kit creation — colors, fonts, visual direction loaded into the Brain",
      "AI avatar built for your business — custom AI video presence",
      "Posts + Reels content system — static captions and AI avatar video reels",
      "Monthly Brain update — new SOPs, offers, and skill files added as you grow",
      "One custom add-on build per quarter — your choice",
      "Quarterly strategy audit — full business review via Loom",
      "Priority async support + first access to new features",
    ],
    cta: "Start with Growth",
    featured: true,
  },
];

const automations = [
  {
    num: "01",
    label: "Foundation Automation",
    titleA: "Lead Capture +",
    titleB: "Client Onboarding",
    tags: ["Lead Nurture", "Onboarding", "Follow-Up", "AI Response"],
    desc: "The complete revenue journey — from first inquiry to fully onboarded client — running without you touching it. Every lead gets a response. Every new client gets a seamless experience. Nothing falls through the cracks.",
    steps: [
      "New inquiry triggers an AI-written, personalized response in your brand voice",
      "Qualified leads enter an automated follow-up sequence — no manual chasing",
      "On conversion, a welcome sequence fires immediately",
      "Automated check-ins at day 3 and day 7 keep the relationship warm",
      "Built on your existing tools — no new software required",
    ],
  },
  {
    num: "02",
    label: "Visibility Automation",
    titleA: "Social Media",
    titleB: "Content Publishing",
    tags: ["Content", "Scheduling", "Brand Voice", "Multi-Platform"],
    desc: "Consistent, on-brand content published across your platforms — without you writing, designing, or scheduling a single post. You drop a rough idea. The system turns it into content that sounds exactly like you and gets it published.",
    steps: [
      "Drop a voice memo, bullet points, or rough idea into your shared inbox",
      "AI expands it into platform-ready captions in your exact brand voice",
      "Content scheduled and published automatically across your platforms",
      "Monthly prompt refresh keeps angles fresh and engagement consistent",
      "Works from zero — no existing content library required",
    ],
  },
];

const brainPillars = [
  {
    num: "01",
    titleA: "Foundation",
    titleB: "Artifacts",
    desc: "The core documents that define who your business is — your voice, your brand, your customer, and your offers. Everything your AI pulls from. Built once, referenced forever.",
  },
  {
    num: "02",
    titleA: "Operations",
    titleB: "SOPs",
    desc: "The documented version of how your business runs. Every key process written down, step by step. No more institutional knowledge living only in your head — or disappearing when you're unavailable.",
  },
  {
    num: "03",
    titleA: "Decision",
    titleB: "Frameworks",
    desc: "Guides for the decisions that come up over and over — pricing, scope, partnerships, hiring. Stop making the same calls from scratch. Your Brain already knows how you think.",
  },
  {
    num: "04",
    titleA: "Skill",
    titleB: "Files",
    desc: "Pre-built instruction sets that teach your Brain how to do specific tasks — writing content, building SOPs, drafting emails, reviewing strategy. Tag one in conversation and it executes. Add more every month.",
  },
];

const monthlyRows = [
  {
    num: "01",
    titleA: "AI Assistant",
    titleB: "Update",
    cadence: "Done for you · every month",
    desc: "Your custom AI assistant gets updated every month with anything new in your business — new offers, updated pricing, seasonal content angles, new FAQs, anything that changed. It sounds more like you and knows your business more deeply every single month.",
    sticky: "The longer you stay, the smarter it gets. Cancelling means starting over from scratch.",
  },
  {
    num: "02",
    titleA: "Content Prompt",
    titleB: "Refresh",
    cadence: "Automatic · every month",
    desc: "Fresh content angles, hooks, and prompts dropped into your social publishing automation every month. Without this refresh your content starts to sound repetitive and engagement drops. With it, your content stays current, trending, and specifically tuned to your audience.",
    sticky: "This is a dependency built into the core service — the automation needs fresh fuel to keep performing.",
  },
  {
    num: "03",
    titleA: "Monthly Strategy",
    titleB: "Briefing",
    cadence: "Specific to you · every month",
    desc: "One AI development that's relevant to your industry. One specific thing you should be doing differently based on your current setup. Delivered as a short briefing every month — so you stay ahead of where AI is going without spending hours trying to figure it out yourself.",
    sticky: "This is the thing clients say makes them feel like they have an unfair advantage. It's also the hardest thing to replace.",
  },
];

const addons = [
  { title: "AI Website Chatbot", desc: "A custom AI assistant on your website that answers questions, captures leads, and qualifies prospects 24/7 — in your exact brand voice." },
  { title: "DM Auto-Responder", desc: "Instagram or email inquiries trigger an AI-written personalized reply immediately. No lead waits. No DM gets missed." },
  { title: "Testimonial Collector", desc: "After every project or purchase, an automated sequence requests, formats, and stores testimonials — ready to use without you asking." },
  { title: "Appointment Booking Flow", desc: "Booking, confirmation, and reminder sequence fully automated. Clients book. They show up. You do nothing in between." },
  { title: "Invoice & Payment Reminders", desc: "Automated follow-up for outstanding invoices — polite, persistent, and completely hands-off. Cash flow runs on schedule." },
  { title: "Newsletter Automation", desc: "A weekly newsletter drafted from your existing content — written in your voice, formatted, and delivered to your inbox ready to send." },
];

const ownershipPoints = [
  { num: "01", title: "Built on your tools", desc: "We work inside whatever you already use — or help you set up the right tools at no extra cost. No proprietary platform required." },
  { num: "02", title: "You keep everything if you leave", desc: "The automations stay running. The AI assistant stays live. The brand voice doc is yours. You own it all." },
  { num: "03", title: "Fully documented", desc: "Every system we build comes with documentation so you understand how it works — and so does anyone else who ever works with you." },
  { num: "04", title: "No lock-in contracts", desc: "Month to month. No annual commitment required. Clients stay because the value compounds — not because they're contractually obligated." },
];

const Services = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none bg-warm-white">
        <Navbar variant="dark" />

        {/* HERO */}
        <section className="relative overflow-hidden bg-ink min-h-[72vh] grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end px-7 md:px-[52px] pt-[180px] pb-[100px] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-gradient-to-r before:from-accent before:to-transparent">
          <div className="absolute -bottom-[60px] -right-5 font-serif font-light text-warm-white/[0.03] pointer-events-none leading-none whitespace-nowrap text-[160px] md:text-[260px]">
            BUILD
          </div>
          <div>
            <p className="text-[10px] tracking-[0.4em] uppercase text-accent mb-6 animate-fade-up">AI Business Architecture</p>
            <h1 className="font-serif font-light leading-[0.92] text-warm-white animate-fade-up animate-fade-up-delay-1" style={{ fontSize: "clamp(52px, 6.5vw, 96px)" }}>
              One service.<br />Built right.<br /><em className="italic text-stone">Running forever.</em>
            </h1>
          </div>
          <div className="animate-fade-up animate-fade-up-delay-2 relative">
            <p className="text-[15px] font-light leading-[1.9] text-taupe mb-10">
              We don't offer a menu of services. We architect one thing — your AI operating system — and we build it, maintain it, and make it smarter every single month. Everything your business needs to run without you doing it manually.
            </p>
            <div className="font-serif text-[22px] font-light italic text-stone pt-8 border-t border-warm-white/[0.08]">
              "I architect the AI systems that run your business so you don't have to."
            </div>
          </div>
        </section>

        {/* THE ONE SERVICE */}
        <section className="bg-cream px-7 md:px-[52px] py-[140px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20 pb-[60px] border-b border-mist-custom">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">The Service</p>
              <h2 className="font-serif font-light text-ink leading-[0.95]" style={{ fontSize: "clamp(44px, 5vw, 72px)" }}>
                The AI OS<br /><em className="italic">Retainer</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal self-end">
              One monthly retainer. Two core automations built during setup. Three ongoing monthly deliverables that keep your system compounding. Built on your accounts. Owned by you. Getting smarter every month you stay.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] mb-[2px]">
            {pricingTiers.map((p, i) => (
              <div
                key={p.name}
                className={`p-12 md:p-[56px_48px] relative border-t-2 transition-colors duration-300 reveal ${i === 1 ? "reveal-delay-1" : ""} ${
                  p.featured
                    ? "bg-ink border-t-accent"
                    : "bg-warm-white border-t-transparent hover:border-t-accent"
                }`}
              >
                <div className={`text-[10px] tracking-[0.3em] uppercase mb-6 ${p.featured ? "text-accent" : "text-taupe"}`}>
                  {p.label}
                </div>
                <div className={`font-serif text-[40px] font-light mb-1 ${p.featured ? "text-warm-white" : "text-ink"}`}>{p.name}</div>
                <div className={`font-serif text-[22px] font-light italic mb-9 ${p.featured ? "text-stone" : "text-taupe"}`}>{p.price}</div>
                <div className={`text-[10px] tracking-[0.2em] uppercase mb-4 ${p.featured ? "text-accent" : "text-taupe"}`}>{p.includesLabel}</div>
                <ul className="list-none mb-10">
                  {p.items.map((item) => (
                    <li
                      key={item}
                      className={`text-[14px] font-light py-2.5 border-t flex gap-3 ${
                        p.featured
                          ? "text-stone border-t-warm-white/[0.06]"
                          : "text-charcoal border-t-mist-custom"
                      }`}
                    >
                      <span className="text-accent text-[11px] flex-shrink-0 mt-0.5">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/contact"
                  className={`font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white px-10 py-4 no-underline inline-block hover:-translate-y-0.5 transition-all duration-300 ${
                    p.featured ? "bg-accent hover:bg-accent/90" : "bg-ink hover:bg-accent"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Setup fee bar */}
          <div className="bg-charcoal p-9 md:p-[36px_48px] flex flex-col md:flex-row justify-between items-start md:items-center gap-10 reveal">
            <div>
              <div className="font-serif text-[24px] font-light text-warm-white mb-1.5">One-time setup fee</div>
              <p className="text-[13px] font-light text-taupe leading-[1.7]">
                Launch setup covers brand voice doc, AI assistant, both core automations, and full onboarding. Growth setup adds your Business Brain, brand kit, AI avatar, and full posts + reels content system. Paid once. Everything is yours from day one.
              </p>
            </div>
            <div className="flex gap-10 flex-shrink-0">
              <div className="text-center">
                <div className="font-serif text-[32px] font-light text-warm-white">$497</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-taupe mt-1">Launch setup</div>
              </div>
              <div className="text-center">
                <div className="font-serif text-[32px] font-light text-warm-white">$997</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-taupe mt-1">Growth setup</div>
              </div>
            </div>
          </div>
        </section>

        {/* FOUNDATION / CORE AUTOMATIONS */}
        <section className="relative overflow-hidden bg-ink px-7 md:px-[52px] py-[140px]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif font-light text-warm-white/[0.02] pointer-events-none whitespace-nowrap text-[100px] md:text-[160px]">
            FOUNDATION
          </div>
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">Built During Setup</p>
              <h2 className="font-serif font-light text-warm-white leading-[1]" style={{ fontSize: "clamp(44px, 5vw, 64px)" }}>
                The Core<br /><em className="italic text-stone">Automations</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal">
              These two automations are the engine of your AI OS. Built once during onboarding on your own accounts — then they run in the background while you focus on everything else.
            </p>
          </div>

          <div className="flex flex-col gap-[2px] relative">
            {automations.map((a) => (
              <div
                key={a.num}
                className="grid grid-cols-1 md:grid-cols-[80px_1fr_1fr] bg-warm-white/[0.02] border border-warm-white/[0.05] p-10 md:p-[56px_48px] relative overflow-hidden transition-all duration-500 hover:bg-warm-white/[0.04] hover:border-accent/20 group reveal before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-accent before:scale-y-0 before:origin-top before:transition-transform before:duration-500 hover:before:scale-y-100"
              >
                <div className="font-serif text-[13px] tracking-[0.15em] text-taupe pt-1.5 mb-4 md:mb-0">{a.num}</div>
                <div>
                  <div className="text-[10px] tracking-[0.25em] uppercase text-accent mb-4">{a.label}</div>
                  <div className="font-serif font-light text-warm-white leading-[1.1] mb-5" style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}>
                    {a.titleA}<br /><em className="italic">{a.titleB}</em>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.tags.map((tag) => (
                      <span key={tag} className="text-[10px] tracking-[0.15em] uppercase text-taupe border border-stone/15 px-3 py-1.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="md:pl-[60px] mt-8 md:mt-0">
                  <p className="text-[15px] font-light leading-[1.9] text-taupe mb-7">{a.desc}</p>
                  <ul className="list-none">
                    {a.steps.map((step) => (
                      <li key={step} className="text-[13px] font-light text-stone py-2.5 border-t border-warm-white/[0.05] flex gap-3">
                        <span className="text-accent text-[11px] flex-shrink-0 mt-0.5">→</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BUSINESS BRAIN */}
        <section className="relative overflow-hidden bg-ink px-7 md:px-[52px] py-[140px]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif font-light text-warm-white/[0.02] pointer-events-none whitespace-nowrap text-[120px] md:text-[200px]">
            BRAIN
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">Growth Tier Exclusive</p>
              <h2 className="font-serif font-light text-warm-white leading-[0.95]" style={{ fontSize: "clamp(44px, 5vw, 72px)" }}>
                The Business<br /><em className="italic text-stone">Brain</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal self-end">
              An AI Project built specifically for your business — loaded with every artifact, SOP, and skill file you need to run and grow. The source of truth your entire AI OS pulls from. The most complete version of your business that has ever existed in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[2px] mb-[2px] relative">
            {brainPillars.map((b, i) => (
              <div
                key={b.num}
                className={`bg-warm-white/[0.03] border border-warm-white/[0.06] p-12 md:p-[48px_36px] relative reveal ${i === 1 ? "reveal-delay-1" : i === 2 ? "reveal-delay-2" : i === 3 ? "reveal-delay-3" : ""}`}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent opacity-50" />
                <p className="font-serif text-[36px] font-light italic text-warm-white/[0.08] leading-none mb-5">{b.num}</p>
                <p className="font-serif text-[24px] font-light text-warm-white mb-3.5 leading-[1.1]">
                  {b.titleA}<br /><em className="italic">{b.titleB}</em>
                </p>
                <p className="text-[14px] font-light text-taupe leading-[1.85]">{b.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-accent/[0.08] border border-accent/20 p-12 md:p-[48px] mb-[2px] relative reveal">
            <p className="font-serif font-light text-warm-white leading-[1.3] max-w-[780px]" style={{ fontSize: "clamp(22px, 2.5vw, 32px)" }}>
              This isn't a document library. It's <em className="italic text-stone">the most complete, operational version of your business</em> that has ever existed in one place — and it gets more capable every month you stay.
            </p>
          </div>

          <div className="bg-charcoal p-10 md:p-[40px_48px] flex flex-col md:flex-row justify-between items-start md:items-center gap-10 md:gap-[60px] relative reveal">
            <div>
              <p className="font-serif text-[26px] font-light text-warm-white mb-2">
                Monthly Brain Update <em className="italic text-stone">— Growth clients only</em>
              </p>
              <p className="text-[13px] font-light text-taupe leading-[1.7]">
                Every month your Brain gets updated alongside your AI assistant. New SOPs added as your processes evolve. New skill files built for recurring tasks you describe. New offers added to the offer suite. The Brain grows with your business — so the longer you stay, the more complete and irreplaceable it becomes.
              </p>
            </div>
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-9 py-4 no-underline whitespace-nowrap flex-shrink-0 hover:bg-accent/90 transition-colors duration-300"
            >
              Start with Growth
            </Link>
          </div>
        </section>

        {/* MONTHLY DELIVERABLES */}
        <section className="bg-cream px-7 md:px-[52px] py-[140px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">Every Month, Without Fail</p>
              <h2 className="font-serif font-light text-ink leading-[0.95]" style={{ fontSize: "clamp(44px, 5vw, 72px)" }}>
                What Keeps<br />Your System<br /><em className="italic">Growing</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal self-end">
              This is why clients stay. Not because they have to — because every month their AI gets smarter, their content gets sharper, and their business gets harder to compete with. The automations get you in. The monthly intelligence is what makes you irreplaceable.
            </p>
          </div>

          <div className="flex flex-col gap-[2px]">
            {monthlyRows.map((r) => (
              <div
                key={r.num}
                className="grid grid-cols-1 md:grid-cols-[80px_1fr_1fr] p-10 md:p-[52px_48px] bg-warm-white border-t border-mist-custom transition-colors duration-300 hover:bg-ink group reveal"
              >
                <div className="font-serif text-[13px] tracking-[0.15em] text-taupe pt-1.5 mb-4 md:mb-0">{r.num}</div>
                <div>
                  <div className="font-serif text-[36px] font-light text-ink leading-[1.1] mb-3 transition-colors duration-300 group-hover:text-warm-white">
                    {r.titleA}<br /><em className="italic">{r.titleB}</em>
                  </div>
                  <div className="text-[10px] tracking-[0.25em] uppercase text-accent">{r.cadence}</div>
                </div>
                <div className="md:pl-[60px] mt-6 md:mt-0">
                  <p className="text-[15px] font-light leading-[1.9] text-taupe mb-4">{r.desc}</p>
                  <p className="text-[13px] font-light text-charcoal italic transition-colors duration-300 group-hover:text-stone">{r.sticky}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ADD-ONS */}
        <section className="bg-warm-white px-7 md:px-[52px] py-[140px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">Custom Add-Ons</p>
              <h2 className="font-serif font-light text-ink leading-[0.95]" style={{ fontSize: "clamp(44px, 5vw, 72px)" }}>
                Need Something<br /><em className="italic">More?</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal self-end">
              Everything outside the core two automations is a one-time custom build fee on top of the monthly retainer. Built on your accounts. Owned by you forever. No subscription required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[2px]">
            {addons.map((a, i) => (
              <div
                key={a.title}
                className={`bg-cream p-10 md:p-[40px_36px] relative border-t-2 border-t-transparent transition-all duration-300 hover:bg-ink hover:border-t-accent group reveal ${i % 3 === 1 ? "reveal-delay-1" : i % 3 === 2 ? "reveal-delay-2" : ""}`}
              >
                <div className="font-serif text-[24px] font-light text-ink mb-3 leading-[1.1] transition-colors duration-300 group-hover:text-warm-white">
                  {a.title}
                </div>
                <p className="text-[13px] font-light text-taupe leading-[1.8] mb-5 transition-colors duration-300 group-hover:text-stone">
                  {a.desc}
                </p>
                <Link
                  to="/contact"
                  className="font-sans text-[10px] tracking-[0.2em] uppercase text-accent no-underline"
                >
                  Request pricing →
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-[2px] bg-charcoal p-10 md:p-[40px_48px] flex flex-col md:flex-row justify-between items-start md:items-center gap-10 md:gap-[60px] reveal">
            <p className="text-[14px] font-light text-stone leading-[1.8] max-w-[560px]">
              Add-ons are available to any active retainer client. Growth plan clients receive <em className="italic text-warm-white">one free custom build per quarter</em> and have their Business Brain maintained and expanded monthly. Launch clients can upgrade to Growth at any time. When you identify a pain point outside the core service, we quote the build. You approve. We build it once.
            </p>
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-warm-white transition-all duration-300 after:content-['→'] flex-shrink-0"
            >
              Discuss a custom build
            </Link>
          </div>
        </section>

        {/* OWNERSHIP */}
        <section className="bg-ink px-7 md:px-[52px] py-[140px] grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center">
          <div className="reveal">
            <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-6">Built on Your Accounts</p>
            <h2 className="font-serif font-light text-warm-white leading-[1.05] mb-8" style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>
              You own<br />everything<br /><em className="italic text-stone">we build.</em>
            </h2>
            <p className="text-[15px] font-light text-taupe leading-[1.9] mb-5">
              Every automation, every workflow, every AI configuration is built on your own accounts — not ours. You're not renting access to something we control. You own the system from day one.
            </p>
            <p className="text-[15px] font-light text-taupe leading-[1.9]">
              We're not creating dependency on our platform. We're building expertise that compounds inside your business. The more months you work with us, the more your system knows about you — and the more irreplaceable that intelligence becomes.
            </p>
          </div>
          <div className="reveal reveal-delay-1">
            <div className="flex flex-col gap-[2px]">
              {ownershipPoints.map((p) => (
                <div
                  key={p.num}
                  className="bg-warm-white/[0.03] border border-warm-white/[0.06] p-8 md:p-[32px_36px] flex gap-5 items-start transition-colors duration-300 hover:bg-accent/10"
                >
                  <div className="font-serif text-[28px] font-light italic text-accent flex-shrink-0 leading-none">{p.num}</div>
                  <div>
                    <div className="text-[14px] font-medium text-warm-white mb-1.5 tracking-[0.02em]">{p.title}</div>
                    <p className="text-[13px] font-light text-taupe leading-[1.7]">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden bg-cream px-7 md:px-[52px] py-[140px] text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif font-light text-ink/[0.03] pointer-events-none whitespace-nowrap text-[140px] md:text-[260px] leading-none">
            START
          </div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-7 relative reveal">One Service. One Decision.</p>
          <h2 className="font-serif font-light text-ink leading-[0.95] mb-[52px] relative reveal" style={{ fontSize: "clamp(44px, 5.5vw, 80px)" }}>
            Ready to stop doing<br />manually what a machine<br /><em className="italic">can do for you?</em>
          </h2>
          <div className="flex flex-col md:flex-row justify-center gap-7 items-center relative reveal">
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-ink px-10 py-4 no-underline inline-block hover:bg-accent hover:-translate-y-0.5 transition-all duration-300"
            >
              Start the Architecture
            </Link>
            <Link
              to="/how-it-works"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
            >
              See how it works
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default Services;
