import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import MarqueeStrip from "@/components/MarqueeStrip";
import ProblemSolutionSection from "@/components/ProblemSolutionSection";
import ServicesSection from "@/components/ServicesSection";
import MonthlyValueSection from "@/components/MonthlyValueSection";
import PhilosophySection from "@/components/PhilosophySection";
import ProcessSection from "@/components/ProcessSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Index = () => {
  useScrollReveal();

  return (
    <>
      <Navbar variant="dark" />
      <HeroSection />
      <MarqueeStrip />
      <ProblemSolutionSection />
      <ServicesSection />
      <MonthlyValueSection />
      <PhilosophySection />
      <ProcessSection />
      <ContactSection />
      <Footer />
    </>
  );
};

export default Index;
