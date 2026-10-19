import { useEffect, useState } from "react";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import type { Session, User } from "@supabase/supabase-js";

export interface PortalMembership {
  client_id: string;
  business_name: string | null;
  contact_name: string | null;
  status: string;
}

/**
 * The portal equivalent of useAdminAuth: a real Supabase Auth session,
 * checked against client_portal_users (via the portal_whoami RPC, which
 * reads auth.uid() server-side) rather than trusting a URL param.
 */
export function usePortalAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<PortalMembership[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySession = async (sess: Session | null) => {
      if (!active) return;
      setSession(sess);
      setUser(sess?.user ?? null);

      if (!sess?.user) {
        setMemberships([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabasePortal.rpc("portal_whoami");
        if (!active) return;
        setMemberships(error || !data ? [] : (data as PortalMembership[]));
      } catch {
        if (active) setMemberships([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    let lastUserId: string | null | undefined = undefined;
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event, sess) => {
      const nextUserId = sess?.user?.id ?? null;
      if (lastUserId !== undefined && nextUserId === lastUserId && event !== "SIGNED_OUT") {
        return;
      }
      lastUserId = nextUserId;
      setLoading(true);
      setTimeout(() => {
        void applySession(sess);
      }, 0);
    });

    supabasePortal.auth.getSession()
      .then(({ data: { session: sess } }) => {
        lastUserId = sess?.user?.id ?? null;
        return applySession(sess);
      })
      .catch(() => {
        if (!active) return;
        lastUserId = null;
        setSession(null);
        setUser(null);
        setMemberships([]);
        setLoading(false);
      });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabasePortal.auth.signOut();
  };

  const isMemberOf = (clientId: string | undefined) =>
    !!clientId && !!memberships?.some((m) => m.client_id === clientId);

  return { session, user, memberships, loading, signOut, isMemberOf };
}
