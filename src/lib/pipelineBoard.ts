// Data fetch for the Pipeline page (CRE-332 Phase 6). Hits the pipeline-board
// edge function, which is the only place SURECONTACT_API_KEY is usable —
// this file never talks to SureContact directly.
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export type BoardColumnKey = "lead" | "intake" | "proposalSent" | "signed" | "won" | "lost";

export interface PipelineCard {
  dealUuid: string;
  name: string;
  company: string;
  amountCents: number | null;
  column: BoardColumnKey;
  stageName: string;
  revised: boolean;
  daysInStage: number | null;
  clientId: string | null;
  clientProjectId: string | null;
}

export interface PipelineColumn {
  key: BoardColumnKey;
  label: string;
  count: number;
  totalCents: number;
  deals: PipelineCard[];
}

export interface PipelineBoard {
  pipelineUuid: string;
  syncedAt: string;
  columns: PipelineColumn[];
  lost: { count: number; totalCents: number; deals: PipelineCard[] };
  unmatchedCount: number;
}

export async function loadPipelineBoard(): Promise<PipelineBoard> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/pipeline-board`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.error || "Could not load the pipeline from SureContact");
  return body as PipelineBoard;
}
