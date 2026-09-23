import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import AgentAvatar from "@/components/admin/AgentAvatar";
import { supabase } from "@/integrations/supabase/client";

type Agent = { id: string; name: string; role: string; description: string | null; enabled: boolean; avatar_url: string | null; accent_color: string | null };

export default function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    supabase.from("agents").select("id, name, role, description, enabled, avatar_url, accent_color").order("created_at")
      .then(({ data, error }) => { if (error) toast.error(error.message); else setAgents((data ?? []) as Agent[]); });
  }, []);
  return <AdminLayout><div className="roster">
    <div className="roster__head"><div className="roster__title-block"><div className="roster__eyebrow">Profile</div><h1 className="roster__title">Your <em>agents</em></h1><hr className="roster__rule" /></div></div>
    <div className="dash__agents">{agents.map((agent) => <div key={agent.id} className="agent-card" style={{ opacity: agent.enabled ? 1 : 0.55 }}>
      <button className="agent-card__head" onClick={() => navigate(`/admin/agents/${agent.id}`)}><AgentAvatar name={agent.name} url={agent.avatar_url} accent={agent.accent_color} size={104} />
        <span className="agent-card__id"><span className="agent-card__name">{agent.name}<span className="agent-card__chev">›</span></span><span className="agent-card__role">{agent.role}</span>{!agent.enabled && <span className="agent-card__paused">Paused</span>}</span>
      </button>{agent.description && <div className="agent-card__empty">{agent.description}</div>}
    </div>)}</div>
  </div></AdminLayout>;
}