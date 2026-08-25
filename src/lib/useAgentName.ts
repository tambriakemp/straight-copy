// An agent's display name, read from the row rather than written into the UI.
//
// Agents get renamed — four of the six have been. Nothing in the runtime cares,
// because every lookup is by `key` or `id`, but prose that says "Iris books on
// her next run" quietly becomes wrong the moment she is called something else,
// and nobody notices because it still renders.
//
// Cached at module scope: the roster is six rows that change about never, and
// every card that mentions an agent would otherwise fire its own query on
// mount.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();
let inflight: Promise<void> | null = null;

async function loadRoster(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from("agents").select("key, name");
    for (const row of data ?? []) {
      if (row.key && row.name) cache.set(row.key, row.name);
    }
  })();
  try {
    await inflight;
  } finally {
    // Cleared so a later mount can retry if the first attempt failed, but not
    // so eagerly that every card refetches.
    if (!cache.size) inflight = null;
  }
}

/**
 * The agent's name, or `fallback` until it loads.
 *
 * The fallback should read correctly on its own — this renders before the
 * query returns, and on any screen where the roster cannot be read at all.
 * "your social media manager" works; "Loading…" in the middle of a sentence
 * does not.
 */
export function useAgentName(key: string, fallback: string): string {
  const [name, setName] = useState<string>(cache.get(key) ?? fallback);

  useEffect(() => {
    let cancelled = false;
    if (cache.has(key)) {
      setName(cache.get(key)!);
      return;
    }
    void loadRoster().then(() => {
      if (!cancelled && cache.has(key)) setName(cache.get(key)!);
    });
    return () => { cancelled = true; };
  }, [key]);

  return name;
}
