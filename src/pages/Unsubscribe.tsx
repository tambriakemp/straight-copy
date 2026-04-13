import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "valid" | "already" | "invalid" | "success" | "error">("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (res.ok && data.valid) setStatus("valid");
        else if (data.reason === "already_unsubscribed") setStatus("already");
        else setStatus("invalid");
      } catch {
        setStatus("invalid");
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch {
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {status === "loading" && (
          <p className="text-taupe text-sm tracking-widest uppercase">Loading…</p>
        )}

        {status === "valid" && (
          <>
            <div className="font-serif text-5xl text-accent mb-6">✦</div>
            <h1 className="font-serif text-3xl font-light text-foreground mb-4">Unsubscribe</h1>
            <p className="text-sm text-taupe leading-relaxed mb-8">
              Click the button below to unsubscribe from future emails from CRE8 Visions.
            </p>
            <button
              onClick={handleUnsubscribe}
              disabled={processing}
              className="font-sans text-[11px] tracking-[0.2em] uppercase text-warm-white bg-ink border-none px-12 py-[18px] hover:bg-accent transition-all duration-300 disabled:opacity-50"
            >
              {processing ? "Processing…" : "Confirm Unsubscribe"}
            </button>
          </>
        )}

        {status === "success" && (
          <>
            <div className="font-serif text-5xl text-accent mb-6">✦</div>
            <h1 className="font-serif text-3xl font-light text-foreground mb-4">You've been unsubscribed.</h1>
            <p className="text-sm text-taupe leading-relaxed">
              You will no longer receive emails from us. We're sorry to see you go.
            </p>
          </>
        )}

        {status === "already" && (
          <>
            <div className="font-serif text-5xl text-accent mb-6">✦</div>
            <h1 className="font-serif text-3xl font-light text-foreground mb-4">Already unsubscribed.</h1>
            <p className="text-sm text-taupe leading-relaxed">
              This email address has already been unsubscribed.
            </p>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1 className="font-serif text-3xl font-light text-foreground mb-4">Invalid link.</h1>
            <p className="text-sm text-taupe leading-relaxed">
              This unsubscribe link is invalid or has expired.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="font-serif text-3xl font-light text-foreground mb-4">Something went wrong.</h1>
            <p className="text-sm text-taupe leading-relaxed">
              Please try again or contact us at hello@cre8visions.com.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
