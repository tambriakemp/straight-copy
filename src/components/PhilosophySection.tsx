const stats = [
  { num: "10×", label: "Faster than traditional shoots" },
  { num: "80%", label: "Lower cost vs. production" },
  { num: "∞", label: "Scalable content volume" },
  { num: "100%", label: "Brand-accurate every time" },
];

import philosophySkincare from "@/assets/philosophy-skincare.jpg";

const PhilosophySection = () => {
  return (
    <section id="philosophy" className="py-[140px] px-8 md:px-[52px] bg-ink grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-[120px] items-center">
      <div className="relative h-[400px] md:h-[560px]">
        <div className="absolute w-[70%] h-[80%] top-0 left-0 overflow-hidden">
          <img src={philosophySkincare} alt="Botanical repair serum product shot" className="w-full h-full object-cover" />
        </div>
        <div className="absolute w-[55%] h-[55%] bottom-0 right-0 bg-gradient-to-br from-accent to-taupe opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[48px] md:text-[64px] font-light italic text-warm-white whitespace-nowrap drop-shadow-2xl">
          "Real."
        </div>
      </div>
      <div className="reveal">
        <p className="text-[11px] tracking-[0.35em] uppercase text-stone mb-8">Our Philosophy</p>
        <div className="w-12 h-px bg-accent mb-8" />
        <h2 className="font-serif text-[clamp(36px,4vw,56px)] font-light leading-[1.15] text-warm-white mb-10">
          The future of<br />brand content<br />is <em className="italic text-stone">already here.</em>
        </h2>
        <p className="text-[13px] font-light leading-[1.9] text-taupe mb-6">
          Brands used to need a full production crew, a studio, a photographer, models, and weeks of lead time. We've collapsed that entire process into days — without sacrificing a single pixel of quality.
        </p>
        <p className="text-[13px] font-light leading-[1.9] text-taupe mb-6">
          Most people can't tell the difference. That's the point.
        </p>
        <div className="grid grid-cols-2 gap-8 mt-14 pt-10 border-t border-warm-white/[0.08]">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="font-serif text-[48px] font-light text-warm-white leading-none">{s.num}</div>
              <div className="text-[11px] tracking-[0.15em] uppercase text-taupe mt-2">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PhilosophySection;
