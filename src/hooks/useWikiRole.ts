import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export type WikiRole = "founder" | "intern" | "contractor" | null;

export function useWikiRole() {
  const { user, isAdmin, loading: authLoading } = useAdminAuth();
  const [role, setRole] = useState<WikiRole>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setRole(null); setActive(false); setLoading(false); return; }
    if (isAdmin) { setRole("founder"); setActive(true); setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("wiki_user_roles")
        .select("role, active")
        .eq("user_id", user.id)
        .maybeSingle();
      setRole((data?.role as WikiRole) ?? null);
      setActive(!!data?.active);
      setLoading(false);
    })();
  }, [user, isAdmin, authLoading]);

  const isFounder = role === "founder";
  const hasAccess = isFounder || (active && (role === "intern" || role === "contractor"));
  return { role, active, isFounder, hasAccess, loading: loading || authLoading };
}
