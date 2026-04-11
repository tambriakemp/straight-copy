import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import MarqueeStrip from "@/components/MarqueeStrip";
import ServicesSection from "@/components/ServicesSection";
import PhilosophySection from "@/components/PhilosophySection";
import ProcessSection from "@/components/ProcessSection";
import WorkSection from "@/components/WorkSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";

const Index = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none">
        <Navbar />
        <HeroSection />
        <MarqueeStrip />
        <ServicesSection />
        <PhilosophySection />
        <ProcessSection />
        <WorkSection />
        <ContactSection />
        <Footer />
      </div>
    </>
  );
};

export default Index;
