import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useCustomCursor } from "@/hooks/useCustomCursor";

const Privacy = () => {
  useScrollReveal();
  const { cursorRef, ringRef } = useCustomCursor();

  const sections = [
    {
      title: "Information We Collect",
      content: [
        "When you contact us through our website, we may collect your name, email address, company name, and any details you share about your project. We also collect standard analytics data such as browser type, device information, and pages visited to improve our website experience.",
        "We do not collect sensitive personal information such as financial data, government IDs, or health information through our website.",
      ],
    },
    {
      title: "How We Use Your Information",
      content: [
        "We use the information you provide to respond to inquiries, schedule discovery calls, deliver our creative services, and communicate project updates. Analytics data helps us understand how visitors interact with our site so we can improve the experience.",
        "We will never sell, rent, or share your personal information with third parties for their marketing purposes.",
      ],
    },
    {
      title: "Cookies & Analytics",
      content: [
        "Our website may use cookies and similar technologies to enhance your browsing experience and gather anonymous usage statistics. You can control cookie preferences through your browser settings at any time.",
        "We may use third-party analytics services (such as Google Analytics) that collect anonymized data about site traffic and user behavior.",
      ],
    },
    {
      title: "Data Retention & Security",
      content: [
        "We retain your contact information only as long as necessary to fulfill the purpose for which it was collected — typically for the duration of our business relationship and any applicable legal obligations.",
        "We implement reasonable security measures to protect your information from unauthorized access, alteration, or disclosure. However, no method of transmission over the internet is 100% secure.",
      ],
    },
    {
      title: "Your Rights",
      content: [
        "You have the right to request access to, correction of, or deletion of your personal information at any time. You may also opt out of any marketing communications we send.",
        "To exercise any of these rights, please contact us at hello@cre8visions.com.",
      ],
    },
    {
      title: "Third-Party Links",
      content: [
        "Our website may contain links to third-party websites or services. We are not responsible for the privacy practices or content of those external sites. We encourage you to review their privacy policies before providing any personal information.",
      ],
    },
    {
      title: "Changes to This Policy",
      content: [
        "We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. Any updates will be posted on this page with a revised effective date.",
      ],
    },
  ];

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none">
        <Navbar />

        {/* Hero */}
        <section className="pt-[180px] pb-[100px] px-8 md:px-[52px] bg-ink relative overflow-hidden">
          <div className="absolute -bottom-[60px] -right-5 font-serif text-[220px] font-light text-white/[0.03] pointer-events-none leading-none whitespace-nowrap">
            PRIVACY
          </div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-taupe mb-6 animate-fade-up">Legal</p>
          <h1 className="font-serif text-[clamp(48px,6vw,88px)] font-light leading-[0.9] text-warm-white mb-8 animate-fade-up animate-fade-up-delay-1">
            Privacy<br /><em className="italic text-stone">Policy</em>
          </h1>
          <p className="text-[13px] font-light leading-[1.9] text-taupe max-w-[480px] animate-fade-up animate-fade-up-delay-2">
            Your privacy matters to us. This policy explains how Cre8 Visions collects, uses, and protects your information.
          </p>
        </section>

        <div className="h-px bg-gradient-to-r from-accent to-transparent mx-8 md:mx-[52px]" />

        {/* Content */}
        <section className="py-[100px] px-8 md:px-[52px] max-w-[900px]">
          <p className="text-[10px] tracking-[0.25em] uppercase text-taupe mb-12 reveal">
            Effective Date — January 1, 2026
          </p>

          {sections.map((s, i) => (
            <div key={s.title} className={`mb-16 reveal ${i % 2 === 0 ? "" : "reveal-delay-1"}`}>
              <div className="flex items-baseline gap-4 mb-6">
                <span className="font-serif text-[13px] tracking-[0.15em] text-taupe">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="font-serif text-[clamp(28px,3vw,40px)] font-light text-foreground leading-[1.1]">
                  {s.title}
                </h2>
              </div>
              {s.content.map((p, j) => (
                <p key={j} className="text-[13px] font-light leading-[1.9] text-taupe mb-4 pl-[52px]">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </section>

        {/* Contact CTA */}
        <section className="py-[100px] px-8 md:px-[52px] bg-cream text-center">
          <h2 className="font-serif text-[clamp(36px,4vw,56px)] font-light text-foreground mb-4 reveal">
            Questions about<br />your <em className="italic text-accent">data?</em>
          </h2>
          <p className="text-[13px] font-light text-taupe mb-12 reveal">
            Reach out anytime — we're happy to help.
          </p>
          <div className="flex justify-center gap-6 items-center reveal">
            <Link
              to="/contact"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-ink px-10 py-4 no-underline inline-block hover:bg-accent hover:-translate-y-0.5 transition-all duration-300"
            >
              Contact Us
            </Link>
            <Link
              to="/"
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-charcoal no-underline flex items-center gap-2.5 hover:gap-4 hover:text-accent transition-all duration-300 after:content-['→']"
            >
              Back to Home
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default Privacy;
