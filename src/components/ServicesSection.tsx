const automations = [
  {
    num: "Automation 01",
    icon: "Lead.",
    title: "Lead Capture +\n*Client Onboarding*",
    desc: "The complete journey from first inquiry to onboarded client — running without you touching it. No lead gets lost. No new client feels forgotten.",
    steps: [
      "New inquiry triggers an AI-written personalized response",
      "Qualified leads move into an automated follow-up sequence",
      "On conversion — welcome sequence fires immediately",
      "Day 3 and day 7 check-ins go out automatically",
    ],
  },
  {
    num: "Automation 02",
    icon: "Visible.",
    title: "Social Media\n*Content Publishing*",
    desc: "Consistent content published in your exact voice across your platforms — without you scheduling, writing, or designing a single post.",
    steps: [
      "Drop a voice memo or rough idea into a shared inbox",
      "AI turns it into platform-ready captions in your brand voice",
      "Content scheduled and published automatically",
      "Works whether you're starting from zero or scaling up",
    ],
  },
];

const upchargeTags = [
  "AI Website Chatbot",
  "DM Auto-Responder",
  "Testimonial Collector",
  "Appointment Booking",
  "Invoice Reminders",
  "Newsletter Automation",
  "Custom Reporting",
];

const renderTitle = (title: string) => {
  // split on '*...*' to italicize
  const parts = title.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? (
      <em key={i} className="italic">{part.slice(1, -1)}</em>
    ) : (
      <span key={i} className="whitespace-pre-line">{part}</span>
    )
  );
};

const ServicesSection = () => {
  return (
    <section id="services" className="py-[140px] px-8 md:px-[52px] bg-warm-white">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end mb-20">
        <div className="reveal">
          <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">The Core Build</p>
          <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light leading-[0.95] text-ink">
            What Every<br /><em className="italic">Client Gets</em>
          </h2>
        </div>
        <p className="text-[14px] font-light text-taupe leading-[1.9] reveal">
          Two automations. Built once. Running forever. Installed on your accounts, owned by you, running in the background while you focus on your business.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px]">
        {automations.map((a, i) => (
          <div
            key={a.num}
            className={`bg-cream p-10 md:p-14 relative overflow-hidden transition-colors duration-400 group hover:bg-ink reveal ${i > 0 ? `reveal-delay-${i}` : ""} before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-accent before:scale-x-0 before:origin-left hover:before:scale-x-100 before:transition-transform before:duration-400`}
          >
            <div className="text-[11px] tracking-[0.2em] text-taupe mb-7 transition-colors duration-400 group-hover:text-stone">
              {a.num}
            </div>
            <div className="font-serif text-[48px] font-light italic text-mist-custom mb-5 leading-none transition-colors duration-400 group-hover:text-warm-white/[0.06]">
              {a.icon}
            </div>
            <div className="font-serif text-[32px] font-light text-ink mb-4 leading-[1.1] transition-colors duration-400 group-hover:text-warm-white">
              {renderTitle(a.title)}
            </div>
            <p className="text-[15px] font-light leading-[1.85] text-taupe transition-colors duration-400 group-hover:text-stone">
              {a.desc}
            </p>
            <ul className="list-none mt-7">
              {a.steps.map((step, idx) => (
                <li
                  key={idx}
                  className="text-[13px] font-light text-charcoal py-2 border-t border-mist-custom flex gap-2.5 transition-colors duration-400 group-hover:text-stone group-hover:border-warm-white/[0.06]"
                >
                  <span className="text-accent text-[11px] flex-shrink-0 mt-px">→</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-[2px] bg-charcoal p-12 grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-10 md:gap-15 items-center reveal">
        <div>
          <div className="font-serif text-[28px] font-light text-warm-white mb-2">Need something more?</div>
          <p className="text-[13px] font-light text-taupe leading-[1.7]">
            Custom builds available as one-time add-ons — built on your accounts, owned by you forever.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {upchargeTags.map((tag) => (
            <span key={tag} className="text-[11px] tracking-[0.1em] text-stone border border-stone/20 px-4 py-2">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
