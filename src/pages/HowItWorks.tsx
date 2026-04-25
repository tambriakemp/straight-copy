import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";

const timeline = [
  { num: "01", phase: "Day 1", title: "Discovery Conversation", time: "10–15 min" },
  { num: "02", phase: "Days 2–7", title: "We Build Your Foundation", time: "5–7 business days" },
  { num: "03", phase: "Day 8", title: "Delivery Day", time: "Everything goes live" },
  { num: "04", phase: "Month 1+", title: "The System Runs", time: "Automated & monitored" },
  { num: "05", phase: "Every Month", title: "Intelligence Compounds", time: "Smarter every month" },
];

interface StepDetail {
  label: string;
  items: string[];
}

interface Step {
  num: string;
  phase: string;
  timing: string[];
  titleA: string;
  titleB: string;
  body: string[];
  details: StepDetail[];
  callout?: string;
}

const steps: Step[] = [
  {
    num: "01",
    phase: "Day 1",
    timing: ["10–15 minutes", "No prep needed", "No calls required"],
    titleA: "The Discovery",
    titleB: "Conversation",
    body: [
      "This isn't a form or an onboarding questionnaire. It's a guided conversation — you type naturally, like you're texting someone who's genuinely curious about your business. It asks one question at a time, follows up when it needs more detail, and wraps up when it has everything it needs.",
      "You don't need to prepare anything. You don't need to know what tools you want to use. You don't need to have a brand guide or existing content. We built the conversation to work for businesses at any stage — from day one to year five.",
    ],
    details: [
      {
        label: "What it covers",
        items: [
          "Your business, your offers, your customer",
          "How you talk and what your brand sounds like",
          "Your biggest time drains and repetitive tasks",
          "What tools you currently use",
          "Your 90-day goals and what success looks like",
        ],
      },
      {
        label: "What you walk away with",
        items: [
          "A complete intake summary automatically generated",
          "Clarity on exactly what gets built first",
          "A confirmation that we received everything",
          "A build start date within 24 hours",
        ],
      },
    ],
    callout: "\"Most clients tell us this was the easiest onboarding they've ever done. That's by design. You talk. We listen. The system does the rest.\"",
  },
  {
    num: "02",
    phase: "Days 2–7",
    timing: ["5–7 business days", "You do nothing", "We build everything"],
    titleA: "We Build Your",
    titleB: "Foundation",
    body: [
      "While you run your business, we architect your AI operating system. Everything gets built using your intake conversation as the blueprint — your voice, your workflows, your tools, your goals. Nothing is generic. Everything is specific to you.",
      "We build on your accounts — not ours. By the time we're done, everything lives inside tools you already own or have access to. You're not renting anything from us.",
    ],
    details: [
      {
        label: "Brand voice document + brand kit",
        items: [
          "Your tone, personality, and communication style",
          "Words you use and words to avoid",
          "Brand kit — colors, fonts, visual direction",
          "Loaded into your Brain and content system",
        ],
      },
      {
        label: "Custom AI assistant",
        items: [
          "Trained on your brand voice document",
          "Loaded with your offer details and FAQs",
          "Knows your customer better than most tools ever will",
          "Writes everything in your voice from day one",
        ],
      },
      {
        label: "Lead capture + onboarding flow",
        items: [
          "Connected to your existing inquiry channels",
          "AI response built and tested in your voice",
          "Welcome sequence written and loaded",
          "Day 3 and day 7 check-ins scheduled",
        ],
      },
      {
        label: "Social content publishing",
        items: [
          "Shared inbox set up for your ideas",
          "First month of prompts loaded and tested",
          "Publishing connected to your platforms",
          "Brand voice baked into every output",
        ],
      },
    ],
  },
  {
    num: "03",
    phase: "Day 8",
    timing: ["Delivery day", "Everything live", "15-min walkthrough"],
    titleA: "Delivery",
    titleB: "Day",
    body: [
      "You receive a Loom video — typically 12–18 minutes — walking you through everything we built. Where it lives, how to use it, what happens automatically, and what requires your input. You watch it at your own pace. No live call required unless you want one.",
      "Along with the Loom you receive your full documentation — every system explained in plain language, with step-by-step instructions for anything that requires your touch. This document is yours forever.",
    ],
    details: [
      {
        label: "What arrives in your inbox",
        items: [
          "Loom walkthrough video (12–18 min)",
          "Your brand voice document (PDF)",
          "Link to your custom AI assistant",
          "System documentation and SOPs",
          "Instructions for your content inbox",
        ],
      },
      {
        label: "What's live and running",
        items: [
          "Lead capture automation — active",
          "Onboarding sequence — ready to fire",
          "Social content system — posts + reels ready",
          "AI assistant — live and tested",
          "Business Brain — loaded and ready (Growth)",
          "AI avatar — built and connected (Growth)",
        ],
      },
    ],
    callout: "\"Your business is already running differently on day 8 than it was on day 1. Most clients send their first content drop the same day they receive their Loom.\"",
  },
  {
    num: "04",
    phase: "Month 1+",
    timing: ["System runs", "You focus on growth", "We monitor everything"],
    titleA: "The System",
    titleB: "Runs",
    body: [
      "This is where most clients describe the same experience — the first time a lead gets a response while they were asleep. The first time a new client gets their welcome sequence without anyone sending it. The first week of content goes out without them writing a word.",
      "We monitor both automations in the background. If something breaks, updates, or needs attention — we handle it before you even notice. Your job is to keep running your business. Our job is to make sure the system keeps running it alongside you.",
    ],
    details: [
      {
        label: "What you do in month 1",
        items: [
          "Drop ideas into your content inbox when inspired",
          "Use your AI assistant for writing tasks",
          "Watch what the automation handles on its own",
          "Tell us anything that needs adjusting",
        ],
      },
      {
        label: "What we do in month 1",
        items: [
          "Monitor both automations for performance",
          "Fine-tune anything that needs adjusting",
          "Prepare the first monthly deliverables",
          "Note any upcharge opportunities for month 2",
        ],
      },
    ],
  },
  {
    num: "05",
    phase: "Every Month",
    timing: ["3 deliverables", "System gets smarter", "Compounds over time"],
    titleA: "Intelligence",
    titleB: "Compounds",
    body: [
      "Every month three things arrive without you asking for them — an updated AI assistant, a fresh batch of content prompts for your publishing automation, and a strategy briefing on one AI development relevant to your business specifically.",
      "These aren't generic. The assistant update is based on what changed in your business that month. The content prompts are tuned to what's trending in your industry. The strategy briefing references your actual setup and tells you one specific thing to consider changing or adding.",
    ],
    details: [
      {
        label: "Monthly AI assistant update",
        items: [
          "New offers and pricing reflected",
          "Seasonal content angles baked in",
          "Updated FAQs from real client questions",
          "Sounds more like you every single month",
        ],
      },
      {
        label: "Content prompt refresh",
        items: [
          "Fresh angles to keep content from going stale",
          "Trending topics in your industry woven in",
          "Engagement-tested hooks and formats",
          "Delivered into your automation automatically",
        ],
      },
    ],
    callout: "\"At month 6, your AI assistant knows your business in a way that took months to build. That knowledge doesn't live anywhere else. That's the architecture at work.\"",
  },
];

const transformation = [
  {
    when: "Before",
    headline: "Running on manual everything",
    items: [
      "Responding to every lead yourself",
      "Posting when you remember to",
      "Onboarding new clients by hand",
      "No system under any of it",
      "Doing it all, scaling nothing",
    ],
  },
  {
    when: "Month 1",
    headline: "Foundation is live",
    items: [
      "Leads responded to automatically",
      "First content batch published without you",
      "New clients onboarded hands-free",
      "AI assistant writing in your voice",
      "First tasks genuinely off your plate",
      "Business Brain live with base artifacts (Growth)",
    ],
  },
  {
    when: "Month 3",
    headline: "System is finding its rhythm",
    items: [
      "Content performing consistently",
      "Lead flow feeling more predictable",
      "AI assistant noticeably more accurate",
      "Time freed up for higher-leverage work",
      "Brain expanded with new SOPs and skill files",
      "First custom add-on built and running",
    ],
  },
  {
    when: "Month 6+",
    headline: "The architecture is compounding",
    items: [
      "AI knows your business deeply",
      "System runs with minimal input from you",
      "Competitors can't replicate what you have",
      "Infrastructure that scales with you",
      "Brain contains years of business knowledge",
      "Cancelling would mean losing everything built",
    ],
  },
];

const faqs = [
  {
    q: "Will it actually sound like me — or will it sound like a robot?",
    a: "Your brand voice document is built from your actual words — how you described your business, your tone, the phrases you use naturally. Everything your AI assistant writes is grounded in that document. Does it take a month or two to really dial in? Yes. Is it noticeably better than generic AI from day one? Absolutely. Most clients are surprised how quickly it stops feeling foreign and starts feeling like them.",
  },
  {
    q: "I don't have any content or a brand yet. Is it too early?",
    a: "No. We built this specifically for businesses at any stage. If you're just starting, the discovery conversation becomes the foundation — we extract your voice from how you talk about your business naturally, even if you've never written a single caption or sent a single email. Starting early means the system grows with you from the beginning instead of having to catch up later.",
  },
  {
    q: "Do I need to know anything about AI or tech to make this work?",
    a: "Zero. That's not an exaggeration. The only things you'll ever do are drop ideas into an inbox, read things your AI assistant writes, and talk to us when something needs changing. Everything technical — the automations, the AI configuration, the integrations, the maintenance — is entirely on our side. You don't touch any of it unless you want to.",
  },
  {
    q: "What tools do I need to already have?",
    a: "We work with what you have. If you already use an email platform, a CRM, or social scheduling tool — we build around those. If you're starting from scratch, we'll recommend the right tools during the build and set them up as part of your onboarding. Either way you won't be paying for a stack of new software you don't need.",
  },
  {
    q: "What happens if I want to cancel?",
    a: "Everything stays yours. The automations keep running. The AI assistant stays live. The brand voice document is yours to keep. We build on your accounts specifically so you're never dependent on us for access. Cancel month-to-month with no penalty. We're not interested in keeping clients who aren't getting value — we're interested in building systems that make cancelling feel unnecessary.",
  },
  {
    q: "How long until I actually see results?",
    a: "The automations are live by day 8. Most clients notice a real difference in the first two weeks — usually when a lead gets handled while they were sleeping, or a week of content goes out without them writing anything. The deeper intelligence — the AI that really knows your business — takes two to three months to hit its stride. The architecture is designed to compound. The longer it runs, the more obvious the value becomes.",
  },
  {
    q: "What if my business changes — new offers, new direction?",
    a: "That's exactly what the monthly AI assistant update is for. Every month your assistant gets refreshed with anything new — new pricing, new offers, new messaging, seasonal shifts. The system evolves with your business. You just tell us what changed. We handle the rest.",
  },
];

const ctaSteps = [
  { num: "01", strong: "Start the conversation", text: "10–15 minutes, no prep needed" },
  { num: "02", strong: "We build your foundation", text: "5–7 days, you do nothing" },
  { num: "03", strong: "Your system goes live", text: "day 8, everything running" },
  { num: "04", strong: "It gets smarter every month", text: "compounding from day one" },
];

const HowItWorks = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none bg-warm-white">
        <Navbar variant="dark" />

        {/* HERO */}
        <section className="relative overflow-hidden bg-ink min-h-[72vh] grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end px-7 md:px-[52px] pt-[180px] pb-[100px] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-gradient-to-r before:from-accent before:to-transparent">
          <div className="absolute -bottom-[60px] -right-5 font-serif font-light text-warm-white/[0.03] pointer-events-none leading-none whitespace-nowrap text-[140px] md:text-[220px]">
            PROCESS
          </div>
          <div>
            <p className="text-[10px] tracking-[0.4em] uppercase text-accent mb-6 animate-fade-up">The Process</p>
            <h1 className="font-serif font-light leading-[0.92] text-warm-white animate-fade-up animate-fade-up-delay-1" style={{ fontSize: "clamp(52px, 6.5vw, 96px)" }}>
              Exactly what<br />happens when<br />you work with<br /><em className="italic text-stone">us.</em>
            </h1>
          </div>
          <div className="animate-fade-up animate-fade-up-delay-2 relative">
            <p className="text-[15px] font-light leading-[1.9] text-taupe mb-9">
              No mystery. No tech overwhelm. No wondering what you signed up for. This page walks you through every step — from the first conversation to what your business looks like six months in. By the end you'll know exactly what to expect and why it works.
            </p>
            <div className="font-serif text-[20px] font-light italic text-stone pt-7 border-t border-warm-white/[0.08]">
              Zero technical knowledge required from you. At any point.
            </div>
          </div>
        </section>

        {/* JOURNEY OVERVIEW */}
        <section className="bg-cream px-7 md:px-[52px] py-[120px] relative overflow-hidden">
          <div className="mb-20 reveal">
            <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">The Full Arc</p>
            <h2 className="font-serif font-light text-ink leading-[0.95]" style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>
              Your journey at<br /><em className="italic">a glance</em>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-y-10 gap-x-0 relative">
            <div className="hidden md:block absolute top-[28px] left-0 right-0 h-px bg-gradient-to-r from-accent via-sand to-accent z-0" />
            {timeline.map((t, i) => (
              <div
                key={t.num}
                className={`flex flex-col items-center text-center px-2 md:px-4 relative z-10 group reveal ${i > 0 ? `reveal-delay-${i}` : ""}`}
              >
                <div className="w-14 h-14 rounded-full bg-ink border-2 border-accent flex items-center justify-center mb-6 flex-shrink-0 font-serif text-[18px] font-light text-accent transition-colors duration-300 group-hover:bg-accent group-hover:text-warm-white">
                  {t.num}
                </div>
                <div className="text-[9px] tracking-[0.3em] uppercase text-accent mb-2">{t.phase}</div>
                <div className="font-serif text-[18px] font-light text-ink mb-2 leading-[1.2]">{t.title}</div>
                <div className="text-[11px] text-taupe font-light">{t.time}</div>
              </div>
            ))}
          </div>
        </section>

        {/* STEP BY STEP */}
        <section className="bg-warm-white px-7 md:px-[52px] py-[140px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-[100px]">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">Step by Step</p>
              <h2 className="font-serif font-light text-ink leading-[0.95]" style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>
                The Full<br /><em className="italic">Walkthrough</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal self-end">
              Here's everything that happens — in order, in plain language. What you do, what we do, and what your business looks like at each stage.
            </p>
          </div>

          {steps.map((s, i) => (
            <div
              key={s.num}
              className={`grid grid-cols-1 md:grid-cols-[160px_1fr] border-t border-mist-custom py-16 md:py-20 reveal ${
                i === steps.length - 1 ? "border-b border-mist-custom" : ""
              }`}
            >
              <div className="md:pr-[60px] mb-8 md:mb-0">
                <div className="font-serif text-[80px] md:text-[100px] font-light text-mist-custom leading-[0.9] mb-5">{s.num}</div>
                <div className="text-[9px] tracking-[0.3em] uppercase text-accent mb-2">{s.phase}</div>
                <div className="text-[12px] font-light text-taupe leading-[1.6]">
                  {s.timing.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-serif font-light text-ink mb-6 leading-[1.05]" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
                  {s.titleA}<br /><em className="italic">{s.titleB}</em>
                </h3>
                {s.body.map((p, idx) => (
                  <p key={idx} className="text-[15px] font-light leading-[1.9] text-charcoal mb-4">{p}</p>
                ))}
                <div className="mt-9 grid grid-cols-1 md:grid-cols-2 gap-[2px]">
                  {s.details.map((d) => (
                    <div key={d.label} className="bg-cream p-6 md:p-[24px_28px]">
                      <div className="text-[10px] tracking-[0.25em] uppercase text-accent mb-2.5">{d.label}</div>
                      <ul className="list-none">
                        {d.items.map((item, idx) => (
                          <li
                            key={item}
                            className={`text-[13px] font-light text-charcoal py-1.5 flex gap-2.5 ${idx === 0 ? "" : "border-t border-mist-custom"}`}
                          >
                            <span className="text-accent text-[10px] flex-shrink-0 mt-0.5">→</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {s.callout && (
                  <div className="mt-7 bg-ink p-6 md:p-[24px_28px] border-l-[3px] border-accent">
                    <p className="text-[14px] font-light text-stone leading-[1.8] italic">{s.callout}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* WHAT CHANGES */}
        <section className="bg-ink px-7 md:px-[52px] py-[140px] relative overflow-hidden">
          <div className="absolute top-10 -left-5 font-serif font-light text-warm-white/[0.02] pointer-events-none leading-none text-[120px] md:text-[200px]">
            BEFORE
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20 relative">
            <div className="reveal">
              <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">The Transformation</p>
              <h2 className="font-serif font-light text-warm-white leading-[0.95]" style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>
                What your business<br />looks like <em className="italic text-stone">over time</em>
              </h2>
            </div>
            <p className="text-[15px] font-light text-taupe leading-[1.9] reveal">
              This is what the compounding actually looks like — month by month, in plain terms. Not projections. What our clients consistently experience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[2px] relative">
            {transformation.map((t, i) => (
              <div
                key={t.when}
                className={`bg-warm-white/[0.03] border border-warm-white/[0.05] p-10 md:p-[40px_32px] relative transition-colors duration-300 hover:bg-accent/[0.08] group reveal ${i > 0 ? `reveal-delay-${i}` : ""} before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-accent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300`}
              >
                <div className="text-[10px] tracking-[0.3em] uppercase text-accent mb-5">{t.when}</div>
                <div className="font-serif text-[22px] font-light text-warm-white mb-5 leading-[1.2]">{t.headline}</div>
                <ul className="list-none">
                  {t.items.map((item) => (
                    <li
                      key={item}
                      className="text-[13px] font-light text-taupe py-2 border-t border-warm-white/[0.05] flex gap-2.5 leading-[1.6]"
                    >
                      <span className="text-accent text-[10px] flex-shrink-0 mt-1">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-cream px-7 md:px-[52px] py-[140px] grid grid-cols-1 md:grid-cols-[320px_1fr] gap-16 md:gap-[100px] items-start">
          <div className="md:sticky md:top-[120px] reveal">
            <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-6">Real Questions</p>
            <h2 className="font-serif font-light text-ink leading-[1.05] mb-6" style={{ fontSize: "clamp(36px, 4vw, 52px)" }}>
              Things people<br />actually <em className="italic">ask.</em>
            </h2>
            <p className="text-[14px] font-light text-taupe leading-[1.8]">
              No fluff. No corporate FAQ copy. These are the real questions we get — answered directly.
            </p>
          </div>
          <div className="reveal">
            {faqs.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={f.q} className="border-b border-sand">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full bg-transparent border-none py-8 flex justify-between items-start gap-6 text-left"
                  >
                    <span className="font-serif text-[20px] md:text-[22px] font-light text-ink leading-[1.2]">{f.q}</span>
                    <span
                      className={`text-[20px] text-accent flex-shrink-0 transition-transform duration-300 mt-0.5 font-light ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-500 ease-in-out ${
                      isOpen ? "max-h-[500px] pb-8" : "max-h-0"
                    }`}
                  >
                    <p className="text-[15px] font-light leading-[1.9] text-charcoal">{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* START CTA */}
        <section className="bg-ink px-7 md:px-[52px] py-[160px] grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center relative overflow-hidden">
          <div className="absolute -bottom-[60px] -right-5 font-serif font-light text-warm-white/[0.02] pointer-events-none leading-none whitespace-nowrap text-[160px] md:text-[260px]">
            START
          </div>
          <div className="reveal relative">
            <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-6">Ready to Start</p>
            <h2 className="font-serif font-light text-warm-white leading-[0.95] mb-8" style={{ fontSize: "clamp(44px, 5.5vw, 80px)" }}>
              The conversation<br />takes <em className="italic text-stone">15 minutes.</em><br />The results run<br />for months.
            </h2>
            <p className="text-[15px] font-light text-taupe leading-[1.9]">
              Begin with the discovery conversation. Answer naturally. The system does the rest. Your AI OS build starts within 24 hours of completion.
            </p>
          </div>
          <div className="reveal reveal-delay-1 relative">
            <div className="flex flex-col gap-[2px] mb-10">
              {ctaSteps.map((s) => (
                <div
                  key={s.num}
                  className="bg-warm-white/[0.03] border border-warm-white/[0.06] p-5 md:p-[20px_24px] flex gap-4 items-center"
                >
                  <div className="font-serif text-[20px] font-light text-accent flex-shrink-0">{s.num}</div>
                  <div className="text-[13px] font-light text-stone leading-[1.6]">
                    <strong className="text-warm-white font-normal">{s.strong}</strong> — {s.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <Link
                to="/onboarding"
                className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-10 py-4 no-underline inline-block hover:bg-accent/90 hover:-translate-y-0.5 transition-all duration-300"
              >
                Begin the Conversation
              </Link>
              <Link
                to="/services"
                className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-warm-white transition-all duration-300 after:content-['→']"
              >
                Review services
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default HowItWorks;
