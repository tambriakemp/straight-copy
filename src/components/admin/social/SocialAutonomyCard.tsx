// How much rope the social media manager has on this client.
//
// Lives here rather than in the agent settings panel on purpose: this is a
// per-client decision, and the person making it is the person already looking
// at that client's photos and captions. Burying it in the agent's own settings
// would mean deciding it for a client whose work is not on screen.
//
// Styled to match CoPostSettingsCard, which it sits directly beneath.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAgentName } from "@/lib/useAgentName";

type Level = "inherit" | "propose" | "act_in_app" | "autonomous";

const optionsFor = (who: string): { value: Level; label: string; blurb: string }[] => [
  {
    value: "act_in_app",
    label: "Hold for review",
    blurb:
      "She writes the captions and works out the schedule, and you approve each post before it is booked.",
  },
  {
    value: "autonomous",
    label: "Post unattended",
    blurb:
      "She books posts to go out on this client's accounts without you seeing them first.",
  },
  {
    value: "propose",
    label: "Paused",
    blurb:
      "She proposes everything and nothing runs on its own, including the captions.",
  },
  {
    value: "inherit",
    label: "Use her default",
    blurb:
      `Whatever ${who}'s own autonomy setting says.`,
  },
];

export default function SocialAutonomyCard({ clientProjectId }: { clientProjectId: string }) {
  const who = useAgentName("social-media", "your social media manager");
  const [level, setLevel] = useState<Level>("inherit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("client_projects")
        .select("agent_autonomy")
        .eq("id", clientProjectId)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      setLevel((data?.agent_autonomy as Level) ?? "inherit");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientProjectId]);

  const save = async (next: Level) => {
    setSaving(true);
    const previous = level;
    setLevel(next);
    const { error } = await supabase
      .from("client_projects")
      .update({ agent_autonomy: next === "inherit" ? null : next })
      .eq("id", clientProjectId);
    setSaving(false);
    if (error) {
      setLevel(previous);
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
  };

  if (loading) return null;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 500, color: "hsl(30 12% 20%)", marginBottom: 4 }}>
          What {who} may do for this client
        </h3>
        <p style={{ fontSize: 16, color: "hsl(30 8% 50%)" }}>
          New clients start held for review. Move this on once their captions
          read the way they should.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {optionsFor(who).map((o) => {
          const selected = level === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={saving}
              onClick={() => void save(o.value)}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 8,
                cursor: saving ? "default" : "pointer",
                border: selected
                  ? "1px solid hsl(30 20% 40%)"
                  : "1px solid hsl(30 12% 88%)",
                background: selected ? "hsl(30 30% 97%)" : "transparent",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 500, color: "hsl(30 12% 20%)" }}>
                {o.label}
              </div>
              <div style={{ fontSize: 15, color: "hsl(30 8% 50%)", marginTop: 2 }}>
                {o.blurb}
              </div>
            </button>
          );
        })}
      </div>

      {/* Said plainly rather than as a subtitle under the option. Someone
          skimming should not be able to turn this on without reading it. */}
      {level === "autonomous" && (
        <p style={{ fontSize: 15, color: "hsl(0 45% 40%)" }}>
          Posts for this client will go out without you seeing them.
        </p>
      )}
    </div>
  );
}
