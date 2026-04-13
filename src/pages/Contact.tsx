import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCustomCursor } from "@/hooks/useCustomCursor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Contact = () => {
  const { cursorRef, ringRef } = useCustomCursor();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    brand: "",
    service: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: false }));
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, boolean> = {};
    if (!form.firstName.trim()) newErrors.firstName = true;
    if (!form.email.trim()) newErrors.email = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-contact", {
        body: form,
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Submission failed");
      }

      // Send confirmation email (fire-and-forget)
      const emailId = crypto.randomUUID();
      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "contact-confirmation",
          recipientEmail: form.email.trim(),
          idempotencyKey: `contact-confirm-${emailId}`,
          templateData: { name: form.firstName.trim() },
        },
      }).catch((err) => console.error("Confirmation email error:", err));

      setSubmitted(true);
    } catch (err: any) {
      console.error("Form submission error:", err);
      toast({
        title: "Something went wrong",
        description: err.message || "Please try again or email us directly.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div ref={cursorRef} className="custom-cursor hidden md:block" />
      <div ref={ringRef} className="custom-cursor-ring hidden md:block" />
      <div className="md:cursor-none">
        <Navbar variant="dark" />

        <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
          {/* LEFT: Info */}
          <div className="bg-ink px-8 md:px-[52px] md:pr-[72px] pt-[160px] pb-20 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -bottom-[60px] -left-5 font-serif text-[220px] font-light text-white/[0.03] pointer-events-none leading-none">
              HELLO
            </div>

            <div>
              <p className="text-[11px] tracking-[0.35em] uppercase text-stone mb-6 animate-fade-up">
                Get In Touch
              </p>
              <h1 className="font-serif text-[clamp(48px,5vw,80px)] font-light leading-[0.95] text-warm-white mb-10 animate-fade-up animate-fade-up-delay-1">
                Let's Build<br />
                Something<br />
                <em className="italic text-stone">Real.</em>
              </h1>
              <p className="text-[13px] font-light leading-[1.9] text-taupe max-w-[380px] animate-fade-up animate-fade-up-delay-2">
                Tell us about your brand, your campaign goals, or just say hello. We respond to every inquiry within 24 hours and offer a free 30-minute discovery call for all new clients.
              </p>
            </div>

            <div className="animate-fade-up animate-fade-up-delay-3">
              <div className="flex flex-col gap-1 py-7 border-t border-white/[0.07]">
                <span className="text-[11px] tracking-[0.25em] uppercase text-stone">Email</span>
                <a href="mailto:hello@cre8visions.com" className="font-serif text-lg font-light italic text-stone no-underline hover:text-warm-white transition-colors duration-300">
                  hello@cre8visions.com
                </a>
              </div>
              <div className="flex flex-col gap-1 py-7 border-t border-white/[0.07]">
                <span className="text-[11px] tracking-[0.25em] uppercase text-stone">Response Time</span>
                <span className="font-serif text-lg font-light italic text-stone">Within 24 hours</span>
              </div>
              <div className="flex flex-col gap-1 py-7 border-t border-white/[0.07]">
                <span className="text-[11px] tracking-[0.25em] uppercase text-stone">Based In</span>
                <span className="font-serif text-lg font-light italic text-stone">Atlanta, Georgia</span>
              </div>
              <div className="flex gap-6 pt-10 border-t border-white/[0.07]">
                <a href="https://instagram.com/cre8_visions" target="_blank" rel="noopener noreferrer" className="text-[11px] tracking-[0.25em] uppercase text-stone no-underline hover:text-accent transition-colors duration-300">
                  Instagram
                </a>
                <a href="https://www.linkedin.com/company/cre8visions/" target="_blank" rel="noopener noreferrer" className="text-[11px] tracking-[0.25em] uppercase text-stone no-underline hover:text-accent transition-colors duration-300">
                  LinkedIn
                </a>
              </div>
            </div>
          </div>

          {/* RIGHT: Form */}
          <div className="bg-cream px-8 md:px-[52px] md:pl-[72px] pt-[160px] pb-20 flex flex-col justify-center">
            {!submitted ? (
              <>
                <p className="text-[11px] tracking-[0.35em] uppercase text-charcoal mb-12 animate-fade-up">
                  Start a Project
                </p>

                <div className="grid grid-cols-2 gap-8 mb-9 animate-fade-up animate-fade-up-delay-1">
                  <div>
                    <label className="block text-[11px] tracking-[0.25em] uppercase text-charcoal mb-2.5">First Name</label>
                    <input
                      type="text"
                      placeholder="Jane"
                      value={form.firstName}
                      onChange={(e) => handleChange("firstName", e.target.value)}
                      className={`w-full bg-transparent border-0 border-b ${errors.firstName ? "border-b-red-500" : "border-b-sand"} py-3 font-serif text-lg font-light text-foreground placeholder:text-stone outline-none focus:border-b-accent transition-colors duration-300`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] tracking-[0.25em] uppercase text-charcoal mb-2.5">Last Name</label>
                    <input
                      type="text"
                      placeholder="Smith"
                      value={form.lastName}
                      onChange={(e) => handleChange("lastName", e.target.value)}
                      className="w-full bg-transparent border-0 border-b border-b-sand py-3 font-serif text-lg font-light text-foreground placeholder:text-stone outline-none focus:border-b-accent transition-colors duration-300"
                    />
                  </div>
                </div>

                <div className="mb-9 animate-fade-up animate-fade-up-delay-2">
                  <label className="block text-[11px] tracking-[0.25em] uppercase text-charcoal mb-2.5">Email Address</label>
                  <input
                    type="email"
                    placeholder="jane@yourbrand.com"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    className={`w-full bg-transparent border-0 border-b ${errors.email ? "border-b-red-500" : "border-b-sand"} py-3 font-serif text-lg font-light text-foreground placeholder:text-stone outline-none focus:border-b-accent transition-colors duration-300`}
                  />
                </div>

                <div className="mb-9 animate-fade-up animate-fade-up-delay-2">
                  <label className="block text-[11px] tracking-[0.25em] uppercase text-charcoal mb-2.5">Brand / Company</label>
                  <input
                    type="text"
                    placeholder="Your Brand Name"
                    value={form.brand}
                    onChange={(e) => handleChange("brand", e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-b-sand py-3 font-serif text-lg font-light text-foreground placeholder:text-stone outline-none focus:border-b-accent transition-colors duration-300"
                  />
                </div>

                <div className="mb-9 animate-fade-up animate-fade-up-delay-3">
                  <label className="block text-[11px] tracking-[0.25em] uppercase text-charcoal mb-2.5">Service You're Interested In</label>
                  <select
                    value={form.service}
                    onChange={(e) => handleChange("service", e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-b-sand py-3 font-serif text-lg font-light text-foreground outline-none focus:border-b-accent transition-colors duration-300 appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%228%22%20viewBox%3D%220%200%2012%208%22%3E%3Cpath%20d%3D%22M1%201l5%205%205-5%22%20stroke%3D%22%23A89F94%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_4px_center]"
                  >
                    <option value="" disabled>Select a service</option>
                    <option value="campaign">AI Brand Campaign</option>
                    <option value="lifestyle">Editorial Lifestyle Content</option>
                    <option value="video">Short-Form Video</option>
                    <option value="product">Product Visualization</option>
                    <option value="retainer">Monthly Retainer</option>
                    <option value="unsure">Not Sure Yet</option>
                  </select>
                </div>

                <div className="mb-9 animate-fade-up animate-fade-up-delay-3">
                  <label className="block text-[11px] tracking-[0.25em] uppercase text-charcoal mb-2.5">Tell Us About Your Project</label>
                  <textarea
                    placeholder="Share your vision, goals, timeline, or anything that helps us understand what you need..."
                    value={form.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-b-sand py-3 font-serif text-lg font-light text-foreground placeholder:text-stone outline-none focus:border-b-accent transition-colors duration-300 resize-none h-[100px] leading-[1.6]"
                  />
                </div>

                <div className="flex items-center gap-8 mt-3 animate-fade-up animate-fade-up-delay-4">
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-ink border-none px-12 py-[18px] whitespace-nowrap flex-shrink-0 hover:bg-accent hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Sending..." : "Send Inquiry"}
                  </button>
                  <p className="text-[11px] font-light text-taupe leading-[1.6]">
                    We'll follow up within 24 hours with next steps and a free discovery call invite.
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-[60px] animate-fade-up">
                <div className="font-serif text-[64px] text-accent mb-6">✦</div>
                <div className="font-serif text-[40px] font-light text-foreground mb-4">Message Received.</div>
                <p className="text-[13px] font-light text-taupe leading-[1.8]">
                  Thank you for reaching out. We'll be in touch within 24 hours.<br />
                  In the meantime, explore our work.
                </p>
                <br /><br />
                <Link
                  to="/work"
                  className="text-[11px] tracking-[0.2em] uppercase text-accent no-underline hover:text-foreground transition-colors duration-300"
                >
                  View Our Work →
                </Link>
              </div>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
};

export default Contact;
