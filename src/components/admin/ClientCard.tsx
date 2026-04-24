import { useDraggable } from "@dnd-kit/core";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { FileText } from "lucide-react";
import { TierBadge } from "./StageBadge";

export interface ClientRow {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  tier: string;
  stage: string;
  brand_voice_url: string | null;
  created_at: string;
}

export default function ClientCard({ client }: { client: ClientRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
    data: { stage: client.stage },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-zinc-200 rounded-lg p-3 shadow-sm hover:shadow transition-shadow ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing flex-1 min-w-0"
        >
          <p className="font-semibold text-sm text-zinc-900 truncate">
            {client.business_name || "Untitled"}
          </p>
          <p className="text-xs text-zinc-500 truncate">
            {client.contact_name || client.contact_email || "—"}
          </p>
        </div>
        <TierBadge tier={client.tier} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-zinc-400">
          {formatDistanceToNow(new Date(client.created_at), { addSuffix: true })}
        </p>
        <div className="flex items-center gap-2">
          {client.brand_voice_url && (
            <a
              href={client.brand_voice_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-zinc-400 hover:text-zinc-700"
              title="Brand voice doc"
            >
              <FileText className="h-3.5 w-3.5" />
            </a>
          )}
          <Link
            to={`/admin/clients/${client.id}`}
            className="text-[11px] text-zinc-600 hover:text-zinc-900 underline-offset-2 hover:underline"
          >
            Open
          </Link>
        </div>
      </div>
    </div>
  );
}
