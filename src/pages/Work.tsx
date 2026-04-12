import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";

type Category = "all" | "campaign" | "lifestyle" | "identity" | "web";

const filters: { label: string; value: Category }[] = [
  { label: "All", value: "all" },
  { label: "AI Campaigns", value: "campaign" },
  { label: "Lifestyle", value: "lifestyle" },
  { label: "Brand Identity", value: "identity" },
  { label: "Web", value: "web" },
];

import movementStudioImage from "@/assets/movement-studio.jpg";

const projects = [
  { category: "campaign", tag: "AI Campaign", sub: "Pilates Brand · AI Campaign", name: "Movement Studio", image: movementStudioImage, col: "col-span-7", row: "row-span-6" },
  { category: "lifestyle", tag: "Lifestyle", sub: "Wellness · Lifestyle Editorial", name: "Morning Ritual", gradient: "linear-gradient(140deg, #A89F94 0%, #2A2825 100%)", col: "col-span-5", row: "row-span-4" },
  { category: "identity", tag: null, sub: "Brand Identity", name: "Neutral Studio", gradient: "linear-gradient(160deg, #D4CCBF 0%, #A89F94 100%)", col: "col-span-3", row: "row-span-3" },
  { category: "campaign", tag: null, sub: "Apparel", name: "Glow Edit", gradient: "linear-gradient(130deg, #8B7355 0%, #C8C0B4 100%)", col: "col-span-2", row: "row-span-3" },
  { category: "lifestyle", tag: "Editorial", sub: "Beauty · Lifestyle", name: "Skin Study", gradient: "linear-gradient(160deg, #E8E4DF 0%, #C8C0B4 100%)", col: "col-span-4", row: "row-span-5" },
  { category: "web", tag: null, sub: "Web · E-Commerce", name: "The Still Co.", gradient: "linear-gradient(150deg, #2A2825 0%, #8B7355 100%)", col: "col-span-4", row: "row-span-3" },
  { category: "campaign", tag: null, sub: "Activewear · Campaign", name: "Routine Drop", gradient: "linear-gradient(140deg, #A89F94 0%, #D4CCBF 100%)", col: "col-span-4", row: "row-span-4" },
  { category: "identity", tag: null, sub: "Brand Identity · Logo", name: "Muted Mark", gradient: "linear-gradient(160deg, #1A1916 0%, #A89F94 100%)", col: "col-span-4", row: "row-span-3" },
];

const gridPositions = [
  { gridColumn: "1 / 8", gridRow: "1 / 7" },
  { gridColumn: "8 / 13", gridRow: "1 / 5" },
  { gridColumn: "8 / 11", gridRow: "5 / 8" },
  { gridColumn: "11 / 13", gridRow: "5 / 8" },
  { gridColumn: "1 / 5", gridRow: "7 / 12" },
  { gridColumn: "5 / 9", gridRow: "7 / 10" },
  { gridColumn: "9 / 13", gridRow: "8 / 12" },
  { gridColumn: "5 / 9", gridRow: "10 / 13" },
];

const Work = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();
  const [activeFilter, setActiveFilter] = useState<Category>("all");

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none">
        <Navbar variant="dark" />

        {/* Hero */}
        <section className="pt-[180px] pb-[100px] px-8 md:px-[52px] bg-ink grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-end relative overflow-hidden">
          <div className="absolute -bottom-[60px] -right-2.5 font-serif text-[260px] font-light text-white/[0.03] pointer-events-none leading-none">
            WORK
          </div>
          <div>
            <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-6 animate-fade-up">Selected Projects</p>
            <h1 className="font-serif text-[clamp(56px,7vw,100px)] font-light leading-[0.9] text-warm-white animate-fade-up animate-fade-up-delay-1">
              Our<br /><em className="italic text-stone">Work</em>
            </h1>
          </div>
          <p className="text-sm font-light leading-[1.9] text-taupe max-w-[480px] self-end animate-fade-up animate-fade-up-delay-2">
            Every image you see here was produced entirely with AI — no studio, no photographer, no model booking. Just vision, direction, and technology that makes it real.
          </p>
        </section>

        {/* Filter Bar */}
        <div className="py-8 px-8 md:px-[52px] bg-cream flex flex-wrap gap-2 items-center border-b border-mist sticky top-0 z-40">
          <span className="text-[10px] tracking-[0.25em] uppercase text-taupe mr-4">Filter:</span>
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`font-sans text-[10px] tracking-[0.2em] uppercase px-[18px] py-2 border transition-all duration-300 ${
                activeFilter === f.value
                  ? "bg-ink text-warm-white border-ink"
                  : "bg-transparent text-taupe border-sand hover:bg-ink hover:text-warm-white hover:border-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Portfolio Grid */}
        <section className="py-20 px-8 md:px-[52px]">
          <div className="grid grid-cols-2 md:grid-cols-12 auto-rows-[80px] gap-[3px]">
            {projects.map((p, i) => {
              const dimmed = activeFilter !== "all" && p.category !== activeFilter;
              return (
                <div
                  key={p.name}
                  className={`relative overflow-hidden group reveal transition-all duration-500 ${dimmed ? "opacity-25 grayscale-[60%]" : "opacity-100 grayscale-0"}`}
                  style={{
                    ...gridPositions[i],
                    background: "hsl(var(--sand))",
                  }}
                >
                  <div
                    className="absolute inset-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:scale-105"
                    style={{ background: p.gradient }}
                  />
                  {p.tag && (
                    <div className="absolute top-6 left-6 text-[10px] tracking-[0.2em] uppercase text-white/50 bg-black/20 px-3 py-1.5 backdrop-blur-[4px] z-10">
                      {p.tag}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
                  <div className="absolute bottom-7 left-7 right-7 translate-y-3 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-400">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-white/55 mb-1.5">{p.sub}</div>
                    <div className="font-serif text-2xl font-light text-warm-white mb-3">{p.name}</div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-stone flex items-center gap-2 after:content-['→']">
                      View project
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Case Study */}
        <section className="bg-cream py-[120px] px-8 md:px-[52px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-[72px] gap-6 reveal">
            <div>
              <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-4">Featured Case Study</p>
              <h2 className="font-serif text-[clamp(36px,4vw,56px)] font-light text-foreground leading-[1.05]">
                Movement Studio —<br /><em className="italic">Pilates AI Campaign</em>
              </h2>
            </div>
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
            >
              Start yours
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[3px] reveal">
            {[
              { gradient: "linear-gradient(150deg, #C8C0B4, #8B7355)", label: "Campaign hero image" },
              { gradient: "linear-gradient(160deg, #A89F94, #2A2825)", label: "Lifestyle series" },
              { gradient: "linear-gradient(140deg, #D4CCBF, #C8C0B4)", label: "Still life detail" },
            ].map((panel) => (
              <div key={panel.label} className="h-[500px] relative overflow-hidden" style={{ background: panel.gradient }}>
                <div className="absolute bottom-6 left-6 font-serif text-[13px] italic text-white/70 tracking-[0.05em]">
                  {panel.label}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[3px] mt-[3px] reveal">
            {[
              { label: "Timeline", value: "4 Days" },
              { label: "Images Delivered", value: "48 Assets" },
              { label: "vs. Traditional Shoot", value: "82% Less Cost" },
            ].map((d) => (
              <div key={d.label} className="bg-mist p-10">
                <div className="text-[10px] tracking-[0.25em] uppercase text-taupe mb-3">{d.label}</div>
                <div className="font-serif text-[28px] font-light text-foreground">{d.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-[120px] px-8 md:px-[52px] text-center bg-ink relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-[240px] font-light text-white/[0.02] pointer-events-none whitespace-nowrap">
            START
          </div>
          <h2 className="font-serif text-[clamp(44px,5vw,72px)] font-light text-warm-white mb-4 relative reveal">
            Your brand.<br /><em className="italic text-stone">Your campaign.</em>
          </h2>
          <p className="text-[13px] font-light text-taupe mb-12 relative reveal">
            Let's build something worth looking at.
          </p>
          <div className="flex justify-center gap-6 items-center relative reveal">
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-accent px-10 py-4 no-underline inline-block hover:bg-accent/80 hover:-translate-y-0.5 transition-all duration-300"
            >
              Start a Project
            </Link>
            <Link
              to="/services"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-stone no-underline flex items-center gap-2.5 hover:gap-4 hover:text-warm-white transition-all duration-300 after:content-['→']"
            >
              View Services
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default Work;
