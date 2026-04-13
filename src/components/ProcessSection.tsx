const steps = [
  { num: "01", title: "Brief & Vision", desc: "You share the brand, the feeling, the campaign objective. We listen before we create." },
  { num: "02", title: "Concept Development", desc: "We develop mood boards, visual direction, and creative concepts for your approval." },
  { num: "03", title: "AI Production", desc: "Our team generates and curates campaign-ready imagery with meticulous quality control." },
  { num: "04", title: "Delivery & Scale", desc: "Final assets delivered across all formats. Iterate endlessly at minimal cost." },
];
import { Link } from "react-router-dom";
const ProcessSection = () => {
  return (
    <section id="process" className="py-[140px] px-8 md:px-[52px] bg-cream">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-6">
        <div>
          <p className="text-[11px] tracking-[0.35em] uppercase text-charcoal mb-4">How It Works</p>
          <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light leading-none text-ink">
            The <em className="italic">Process</em>
          </h2>
        </div>
        <Link to="/contact" className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']">
          Begin yours
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[2px]">
        {steps.map((step, i) => (
          <div key={step.num} className={`p-8 md:p-12 bg-warm-white relative reveal ${i > 0 ? `reveal-delay-${i}` : ""}`}>
            <div className="font-serif text-[80px] font-light text-mist-custom leading-none mb-6">{step.num}</div>
            <div className="font-serif text-[22px] font-normal text-ink mb-4">{step.title}</div>
            <div className="text-[12px] font-light leading-[1.8] text-charcoal">{step.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProcessSection;
