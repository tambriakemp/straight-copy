import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useAdminAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySession = async (sess: Session | null) => {
      if (!active) return;
      setSession(sess);
      setUser(sess?.user ?? null);

      if (!sess?.user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("admin_users")
          .select("id")
          .eq("user_id", sess.user.id)
          .maybeSingle();

        if (!active) return;
        setIsAdmin(!error && !!data);
      } catch {
        if (active) setIsAdmin(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    // Set up auth listener FIRST
    let lastUserId: string | null | undefined = undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      const nextUserId = sess?.user?.id ?? null;
      // Ignore token refresh / tab-focus revalidation events that don't change identity.
      // Otherwise switching tabs causes RequireAdmin to flash "Loading…" and remount children.
      if (
        lastUserId !== undefined &&
        nextUserId === lastUserId &&
        event !== "SIGNED_OUT"
      ) {
        return;
      }
      lastUserId = nextUserId;
      setLoading(true);
      // Defer admin check to avoid auth callback deadlocks.
      setTimeout(() => {
        void applySession(sess);
      }, 0);
    });

    // Then check existing session so an already-signed-in admin cannot get stuck loading.
    supabase.auth.getSession()
      .then(({ data: { session: sess } }) => applySession(sess))
      .catch(() => {
        if (!active) return;
        setSession(null);
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { session, user, isAdmin, loading, signOut };
}
