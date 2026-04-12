import { Link } from "react-router-dom";
import morningRitualImage from "@/assets/morning-ritual.jpg";

const projects = [
  { tag: "Pilates Brand · AI Campaign", name: "Movement Studio", gradient: "from-stone to-accent" },
  { tag: "Wellness · Lifestyle Editorial", name: "Morning Ritual", gradient: "from-taupe to-charcoal", image: morningRitualImage },
  { tag: "Apparel · Campaign", name: "Neutral Studio", gradient: "from-sand to-taupe" },
  { tag: "Beauty · Brand Identity", name: "Skin Study", gradient: "from-accent to-stone" },
];

const WorkSection = () => {
  return (
    <section id="work" className="py-[100px] px-8 md:px-[52px] overflow-hidden">
      <div className="flex justify-between items-end mb-[52px]">
        <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light leading-none text-ink reveal">
          Selected <em className="italic">Work</em>
        </h2>
        <Link to="/work" className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']">
          View all projects
        </Link>
      </div>
      <div className="work-scroll flex gap-[2px] overflow-x-auto pb-6">
        {projects.map((p) => (
          <div
            key={p.name}
            className="work-card flex-shrink-0 w-[320px] h-[420px] relative overflow-hidden transition-all duration-500 hover:w-[400px] group"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${p.gradient} opacity-70`} />
            <div className="absolute bottom-8 left-8 right-8">
              <div className="text-[10px] tracking-[0.25em] uppercase text-warm-white/60 mb-2">{p.tag}</div>
              <div className="font-serif text-[26px] font-light text-warm-white">{p.name}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default WorkSection;
