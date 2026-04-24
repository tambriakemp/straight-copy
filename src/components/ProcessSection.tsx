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
    <section id="process" className="py-[140px] px-8 md:px-[52px] bg-warm-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-6 reveal">
        <div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-accent mb-4">How It Works</p>
          <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light leading-[0.95] text-ink">
            The <em className="italic">Architecture</em><br />Process
          </h2>
        </div>
        <Link
          to="/contact"
          className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
        >
          Begin yours
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[2px]">
        {steps.map((step, i) => (
          <div
            key={step.num}
            className={`p-12 md:px-8 md:py-12 bg-cream border-t-2 border-transparent hover:border-accent hover:bg-mist-custom transition-all duration-300 reveal ${i > 0 ? `reveal-delay-${i}` : ""}`}
          >
            <div className="font-serif text-[72px] font-light text-mist-custom leading-none mb-5">{step.num}</div>
            <div className="font-serif text-[22px] font-normal text-ink mb-3">{step.title}</div>
            <div className="text-[14px] font-light leading-[1.8] text-taupe">{step.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProcessSection;
