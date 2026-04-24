import { Link } from "react-router-dom";

const steps = [
  {
    num: "01",
    title: "Discovery Conversation",
    desc: "A guided AI conversation captures everything about your business, brand, and biggest time drains. No forms. No calls needed.",
  },
  {
    num: "02",
    title: "Architecture & Build",
    desc: "We build your brand voice document, AI assistant, and both core automations — installed on your accounts within 5–7 days.",
  },
  {
    num: "03",
    title: "Delivery & Handoff",
    desc: "Everything delivered with a walkthrough video. Your system is live, documented, and running. No call required unless you want one.",
  },
  {
    num: "04",
    title: "Monthly Evolution",
    desc: "Three monthly deliverables keep your AI getting smarter, your content staying fresh, and your business staying ahead.",
  },
];

const ProcessSection = () => {
  return (
    <section id="process" className="py-[120px] md:py-[160px] bg-warm-white">
      <div className="max-w-[1400px] mx-auto px-7 md:px-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-10 reveal">
          <div>
            <p className="inline-flex items-center gap-3.5 text-[11px] font-medium tracking-[0.35em] uppercase text-accent mb-6 before:content-[''] before:w-9 before:h-px before:bg-accent">
              How It Works
            </p>
            <h2
              className="font-serif font-light leading-[1.05] text-ink"
              style={{ fontSize: "clamp(48px, 5.2vw, 80px)", letterSpacing: "-0.01em" }}
            >
              The <em className="italic text-accent">Architecture</em> Process
            </h2>
          </div>
          <Link
            to="/contact"
            className="font-sans text-[12px] font-medium tracking-[0.22em] uppercase text-charcoal no-underline inline-flex items-center gap-3 hover:gap-[18px] hover:text-accent transition-all duration-300 after:content-['→'] after:text-[14px]"
          >
            Begin yours
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[2px] bg-mist-custom">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className={`p-10 md:px-10 md:py-16 bg-cream border-t-2 border-transparent hover:border-accent hover:bg-warm-white transition-all duration-400 reveal ${
                i > 0 ? `reveal-delay-${i}` : ""
              }`}
            >
              <div className="font-serif text-[72px] md:text-[88px] font-light text-sand leading-none mb-8">
                {step.num}
              </div>
              <div className="font-serif text-[26px] font-normal text-ink mb-5 leading-[1.2]">
                {step.title}
              </div>
              <div className="text-[15px] font-light leading-[1.75] text-charcoal">{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProcessSection;
