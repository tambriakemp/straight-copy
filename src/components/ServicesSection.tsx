const automations = [
  {
    num: "Automation 01",
    title: "Lead Capture + *Client Onboarding*",
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
    title: "Social Media *Content Publishing*",
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
  const parts = title.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) =>
    part.startsWith("*") && part.endsWith("*") ? (
      <em key={i} className="italic text-accent">{part.slice(1, -1)}</em>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

const ServicesSection = () => {
  return (
    <section id="services" className="py-[120px] md:py-[160px] bg-warm-white">
      <div className="max-w-[1400px] mx-auto px-7 md:px-16">
        {/* Centered section header with double leading lines */}
        <div className="max-w-[960px] mx-auto text-center mb-20 md:mb-24 reveal">
          <p className="inline-flex items-center justify-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-8 before:content-[''] before:w-9 before:h-px before:bg-accent after:content-[''] after:w-9 after:h-px after:bg-accent">
            The Core Build
          </p>
          <h2
            className="font-serif font-light leading-[1.05] text-ink mb-8"
            style={{ fontSize: "clamp(48px, 5.2vw, 80px)", letterSpacing: "-0.01em" }}
          >
            What Every <em className="italic text-accent">Client Gets</em>
          </h2>
          <p className="text-[19px] font-light leading-[1.75] text-taupe max-w-[680px] mx-auto">
            Two automations. Built once. Running forever. Installed on your accounts, owned by you, running in the background while you focus on your business.
          </p>
        </div>

        {/* Two automation cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] bg-mist-custom">
          {automations.map((a, i) => (
            <div
              key={a.num}
              className={`group bg-cream p-12 md:p-[60px] md:py-[72px] relative overflow-hidden transition-colors duration-500 hover:bg-ink reveal ${
                i > 0 ? `reveal-delay-${i}` : ""
              } before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-accent before:scale-x-0 before:origin-left before:transition-transform before:duration-500 hover:before:scale-x-100`}
            >
              <div className="text-[11px] font-medium tracking-[0.28em] uppercase text-taupe mb-12 transition-colors duration-500 group-hover:text-stone">
                {a.num}
              </div>
              <h3 className="font-serif text-[32px] md:text-[40px] font-light text-ink mb-7 leading-[1.08] transition-colors duration-500 group-hover:text-warm-white">
                {renderTitle(a.title)}
              </h3>
              <p className="text-[17px] font-light leading-[1.75] text-charcoal mb-10 transition-colors duration-500 group-hover:text-stone">
                {a.desc}
              </p>
              <ul className="list-none">
                {a.steps.map((step, idx) => (
                  <li
                    key={idx}
                    className="text-[15px] font-light leading-[1.6] text-charcoal py-4 border-t border-mist-custom grid grid-cols-[20px_1fr] gap-3.5 transition-colors duration-500 group-hover:text-stone group-hover:border-warm-white/[0.08]"
                  >
                    <span className="text-accent text-[14px] leading-[1.7]">→</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Upcharge row */}
        <div className="mt-20 bg-cream p-10 md:p-[64px] md:py-[72px] grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-10 md:gap-[72px] items-center border-t-2 border-accent reveal">
          <div>
            <div className="font-serif text-[28px] md:text-[32px] font-light text-ink mb-4 leading-[1.15]">
              Need something more?
            </div>
            <p className="text-[16px] font-light text-charcoal leading-[1.75]">
              Custom builds available as one-time add-ons — built on your accounts, owned by you forever.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {upchargeTags.map((tag) => (
              <span
                key={tag}
                className="text-[12px] font-medium tracking-[0.14em] uppercase text-charcoal bg-warm-white border border-sand px-5 py-3"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
