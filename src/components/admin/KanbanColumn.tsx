import { useDroppable } from "@dnd-kit/core";
import ClientCard, { ClientRow } from "./ClientCard";

interface Props {
  stageId: string;
  label: string;
  clients: ClientRow[];
}

export default function KanbanColumn({ stageId, label, clients }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  return (
    <div className="flex flex-col w-[280px] shrink-0">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </h3>
        <span className="text-xs text-zinc-400">{clients.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[400px] bg-zinc-100 rounded-lg p-2 space-y-2 transition-colors ${
          isOver ? "bg-zinc-200" : ""
        }`}
      >
        {clients.map((c) => (
          <ClientCard key={c.id} client={c} />
        ))}
        {clients.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">No clients</p>
        )}
      </div>
    </div>
  );
}
