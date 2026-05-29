import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { LayoutGrid, List, Plus, Trash2, X, ExternalLink, Paperclip, Calendar, Tag, Flag, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  tasksApi, TASK_STATUSES, STATUS_LABELS, STATUS_COLORS, PRIORITIES, PRIORITY_COLORS,
  TASK_SIZES, TASK_PLATFORMS,
  type Task, type Epic, type TaskStatus, type TaskPriority, type AssigneeKind,
  type TaskSize, type TaskPlatform, type AcceptanceCriterion,
} from "./tasksApi";

interface Props { clientProjectId: string }

type ViewMode = "kanban" | "list";

const taskSurfaceClass = "bg-ink border-warm-white/15 !text-warm-white [&_*]:!text-warm-white [&_input]:!text-warm-white [&_textarea]:!text-warm-white [&_input::placeholder]:!text-taupe [&_textarea::placeholder]:!text-taupe";
const taskInputClass = "bg-transparent border-warm-white/20 !text-warm-white placeholder:!text-taupe";
const taskSelectContentClass = "bg-ink border-warm-white/15 !text-warm-white [&_*]:!text-warm-white";

export default function ProjectTasksPanel({ clientProjectId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("kanban");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [epicsOpen, setEpicsOpen] = useState(false);
  const [filterEpic, setFilterEpic] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);

  const reload = async () => {
    try {
      const data = await tasksApi.list(clientProjectId);
      setTasks(data.tasks);
      setEpics(data.epics);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // realtime
    const ch = supabase.channel(`project_tasks_${clientProjectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_tasks", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void reload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_task_epics", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProjectId]);

  const topLevel = useMemo(
    () => tasks.filter((t) => !t.parent_task_id)
      .filter((t) => filterEpic === "all" || t.epic_id === filterEpic || (filterEpic === "none" && !t.epic_id))
      .filter((t) => filterAssignee === "all" || t.assignee_kind === filterAssignee),
    [tasks, filterEpic, filterAssignee],
  );

  const subtasksByParent = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) if (t.parent_task_id) {
      const arr = m.get(t.parent_task_id) ?? [];
      arr.push(t); m.set(t.parent_task_id, arr);
    }
    return m;
  }, [tasks]);

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null);
    const taskId = String(e.active.id);
    const overId = e.over?.id;
    if (!overId) return;
    const target = String(overId);
    if (!TASK_STATUSES.includes(target as TaskStatus)) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === target) return;
    // optimistic
    setTasks((prev) => prev.map((x) => x.id === taskId ? { ...x, status: target as TaskStatus } : x));
    try {
      await tasksApi.update(taskId, { status: target as TaskStatus });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move task");
      void reload();
    }
  };

  return (
    <div className="text-warm-white">
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setView("kanban")} style={tabBtnStyle(view === "kanban")}>
            <LayoutGrid size={14} style={{ marginRight: 6 }} /> Kanban
          </button>
          <button onClick={() => setView("list")} style={tabBtnStyle(view === "list")}>
            <List size={14} style={{ marginRight: 6 }} /> List
          </button>
        </div>

        <Select value={filterEpic} onValueChange={setFilterEpic}>
          <SelectTrigger className="w-[180px] bg-transparent border-warm-white/20 !text-warm-white [&_*]:!text-warm-white">
            <SelectValue placeholder="Epic" />
          </SelectTrigger>
          <SelectContent className={taskSelectContentClass}>
            <SelectItem value="all">All epics</SelectItem>
            <SelectItem value="none">No epic</SelectItem>
            {epics.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-[180px] bg-transparent border-warm-white/20 !text-warm-white [&_*]:!text-warm-white">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent className={taskSelectContentClass}>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="claude">Claude</SelectItem>
          </SelectContent>
        </Select>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => setEpicsOpen(true)}
            className="bg-transparent border-warm-white/20 !text-warm-white hover:bg-warm-white/10">
            Manage epics
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}
            className="bg-accent !text-accent-foreground hover:bg-accent/90">
            <Plus size={14} style={{ marginRight: 6 }} /> New task
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-warm-white/70">Loading tasks…</div>
      ) : view === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(260px, 1fr)", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {TASK_STATUSES.map((s) => (
              <KanbanColumn key={s} status={s}
                tasks={topLevel.filter((t) => t.status === s)}
                subtasksByParent={subtasksByParent}
                epics={epics}
                onOpen={setOpenTaskId}
              />
            ))}
          </div>
          <DragOverlay>
            {dragId ? (() => {
              const t = tasks.find((x) => x.id === dragId);
              return t ? <TaskCard task={t} epics={epics} subtaskCount={(subtasksByParent.get(t.id) ?? []).length} dragging /> : null;
            })() : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <ListView tasks={topLevel} epics={epics} subtasksByParent={subtasksByParent} onOpen={setOpenTaskId} />
      )}

      {openTask && (
        <TaskDetailSheet
          task={openTask}
          epics={epics}
          subtasks={subtasksByParent.get(openTask.id) ?? []}
          onClose={() => setOpenTaskId(null)}
          onChanged={reload}
          clientProjectId={clientProjectId}
        />
      )}

      <NewTaskDialog
        open={creating}
        onOpenChange={setCreating}
        epics={epics}
        clientProjectId={clientProjectId}
        onCreated={reload}
      />

      <EpicManagerDialog
        open={epicsOpen}
        onOpenChange={setEpicsOpen}
        epics={epics}
        clientProjectId={clientProjectId}
        onChanged={reload}
      />
    </div>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "hsl(var(--accent))" : "transparent",
    color: active ? "hsl(var(--accent-foreground))" : "hsl(var(--warm-white))",
    border: "none",
    padding: "6px 12px",
    fontSize: 14,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  };
}

/* ---------------- Kanban ---------------- */

function KanbanColumn({
  status, tasks, subtasksByParent, epics, onOpen,
}: {
  status: TaskStatus; tasks: Task[]; subtasksByParent: Map<string, Task[]>; epics: Epic[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} style={{
      background: isOver ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
      border: "1px solid hsl(var(--warm-white) / 0.12)",
      borderRadius: 8,
      padding: 10,
      minHeight: 200,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 8px" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLORS[status] }} />
        <span style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--warm-white))" }}>
          {STATUS_LABELS[status]}
        </span>
        <span style={{ marginLeft: "auto", color: "hsl(var(--warm-white) / 0.7)", fontSize: 14 }}>{tasks.length}</span>
      </div>
      {tasks.map((t) => (
        <DraggableCard key={t.id} task={t} epics={epics}
          subtaskCount={(subtasksByParent.get(t.id) ?? []).length} onOpen={onOpen} />
      ))}
    </div>
  );
}

function DraggableCard({ task, epics, subtaskCount, onOpen }: {
  task: Task; epics: Epic[]; subtaskCount: number; onOpen: (id: string) => void;
}) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task.id)}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        cursor: "grab",
      }}
    >
      <TaskCard task={task} epics={epics} subtaskCount={subtaskCount} />
    </div>
  );
}

function TaskCard({ task, epics, subtaskCount, dragging }: {
  task: Task; epics: Epic[]; subtaskCount: number; dragging?: boolean;
}) {
  const epic = task.epic_id ? epics.find((e) => e.id === task.epic_id) : null;
  return (
    <div style={{
      background: "rgba(20,16,12,0.6)",
      border: "1px solid hsl(var(--warm-white) / 0.12)",
      borderRadius: 6,
      padding: 10,
      boxShadow: dragging ? "0 8px 24px rgba(0,0,0,0.4)" : "none",
    }}>
      {epic && (
        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
          color: epic.color ?? "hsl(var(--warm-white))", marginBottom: 6 }}>
          {epic.name}
        </div>
      )}
      <div style={{ color: "hsl(var(--warm-white))", fontSize: 15, lineHeight: 1.4, marginBottom: 8 }}>
        {task.name}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: PRIORITY_COLORS[task.priority] }}>
          <Flag size={10} /> {task.priority}
        </span>
        {task.assignee_kind !== "unassigned" && (
          <span style={{ fontSize: 12, color: "hsl(var(--warm-white) / 0.7)" }}>
            {task.assignee_kind === "claude" ? "🤖 Claude" : "👤 Admin"}
          </span>
        )}
        {task.due_date && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "hsl(var(--warm-white) / 0.7)" }}>
            <Calendar size={10} /> {task.due_date}
          </span>
        )}
        {subtaskCount > 0 && (
          <span style={{ fontSize: 12, color: "hsl(var(--warm-white) / 0.7)" }}>{subtaskCount} subtask{subtaskCount > 1 ? "s" : ""}</span>
        )}
        {task.url && <ExternalLink size={10} style={{ color: "hsl(var(--warm-white) / 0.7)" }} />}
        {(task.attachments?.length ?? 0) > 0 && <Paperclip size={10} style={{ color: "hsl(var(--warm-white) / 0.7)" }} />}
        {task.tags?.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[9px] py-0 px-1 border-warm-white/15 !text-warm-white/70">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/* ---------------- List view ---------------- */

function ListView({ tasks, epics, subtasksByParent, onOpen }: {
  tasks: Task[]; epics: Epic[]; subtasksByParent: Map<string, Task[]>;
  onOpen: (id: string) => void;
}) {
  return (
    <div style={{ border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 8, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)", color: "hsl(var(--warm-white) / 0.7)", textAlign: "left", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <th style={th}>Name</th><th style={th}>Status</th><th style={th}>Priority</th>
            <th style={th}>Epic</th><th style={th}>Assignee</th><th style={th}>Due</th><th style={th}>Subs</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} onClick={() => onOpen(t.id)}
              style={{ borderTop: "1px solid hsl(var(--warm-white) / 0.12)", color: "hsl(var(--warm-white))", cursor: "pointer" }}>
              <td style={td}>{t.name}</td>
              <td style={td}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLORS[t.status] }} />
                  {STATUS_LABELS[t.status]}
                </span>
              </td>
              <td style={{ ...td, color: PRIORITY_COLORS[t.priority] }}>{t.priority}</td>
              <td style={td}>{epics.find((e) => e.id === t.epic_id)?.name ?? "—"}</td>
              <td style={td}>{t.assignee_kind}</td>
              <td style={td}>{t.due_date ?? "—"}</td>
              <td style={td}>{(subtasksByParent.get(t.id) ?? []).length}</td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr><td colSpan={7} style={{ ...td, color: "hsl(var(--warm-white) / 0.7)", textAlign: "center" }}>No tasks.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
const th: React.CSSProperties = { padding: "10px 12px" };
const td: React.CSSProperties = { padding: "10px 12px" };

/* ---------------- Task detail sheet ---------------- */

function TaskDetailSheet({
  task, epics, subtasks, onClose, onChanged, clientProjectId,
}: {
  task: Task; epics: Epic[]; subtasks: Task[]; onClose: () => void; onChanged: () => Promise<void>;
  clientProjectId: string;
}) {
  const [draft, setDraft] = useState<Task>(task);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(task), [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Partial<Task>) => {
    setSaving(true);
    try {
      await tasksApi.update(task.id, patch);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm("Delete this task?")) return;
    try { await tasksApi.remove(task.id); await onChanged(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const addSubtask = async () => {
    const name = prompt("Subtask name?");
    if (!name?.trim()) return;
    try {
      await tasksApi.create({ client_project_id: clientProjectId, parent_task_id: task.id, name: name.trim() });
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const uploadAttachment = async (file: File) => {
    try { await tasksApi.uploadAttachment(task.id, file); await onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className={`w-[560px] sm:max-w-[560px] overflow-y-auto ${taskSurfaceClass}`}>
        <SheetHeader>
          <SheetTitle className="!text-warm-white text-base flex items-center justify-between">
            <span>Task</span>
            <button onClick={remove} className="text-xs !text-warm-white/80 hover:!text-destructive inline-flex items-center gap-1">
              <Trash2 size={12} /> Delete
            </button>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-warm-white/15 bg-warm-white/5">
            <span className="text-xs uppercase tracking-wider !text-warm-white/60">Task ID</span>
            <code className="text-xs !text-warm-white font-mono truncate flex-1">{task.id}</code>
            <button
              type="button"
              onClick={async () => {
                try { await navigator.clipboard.writeText(task.id); toast.success("Task ID copied"); }
                catch { toast.error("Copy failed"); }
              }}
              className="inline-flex items-center gap-1 text-xs !text-warm-white/80 hover:!text-warm-white px-2 py-1 rounded border border-warm-white/15 hover:border-warm-white/30"
              title="Copy task ID"
            >
              <Copy size={12} /> Copy
            </button>
          </div>
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onBlur={() => draft.name !== task.name && save({ name: draft.name })}
              className={taskInputClass} />
          </Field>
          <Field label="Description">
            <Textarea value={draft.description ?? ""} rows={5}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              onBlur={() => (draft.description ?? "") !== (task.description ?? "") && save({ description: draft.description })}
              className={taskInputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={draft.status} onValueChange={(v) => { setDraft({ ...draft, status: v as TaskStatus }); save({ status: v as TaskStatus }); }}>
                <SelectTrigger className={`${taskInputClass} [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                <SelectContent className={taskSelectContentClass}>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={draft.priority} onValueChange={(v) => { setDraft({ ...draft, priority: v as TaskPriority }); save({ priority: v as TaskPriority }); }}>
                <SelectTrigger className={`${taskInputClass} [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                <SelectContent className={taskSelectContentClass}>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={draft.assignee_kind} onValueChange={(v) => { setDraft({ ...draft, assignee_kind: v as AssigneeKind }); save({ assignee_kind: v as AssigneeKind }); }}>
                <SelectTrigger className={`${taskInputClass} [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                <SelectContent className={taskSelectContentClass}>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Epic">
              <Select value={draft.epic_id ?? "none"} onValueChange={(v) => { const id = v === "none" ? null : v; setDraft({ ...draft, epic_id: id }); save({ epic_id: id }); }}>
                <SelectTrigger className={`${taskInputClass} [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                <SelectContent className={taskSelectContentClass}>
                  <SelectItem value="none">None</SelectItem>
                  {epics.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={draft.due_date ?? ""}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value || null })}
                onBlur={() => (draft.due_date ?? "") !== (task.due_date ?? "") && save({ due_date: draft.due_date })}
                className={taskInputClass} />
            </Field>
            <Field label="URL">
              <Input value={draft.url ?? ""}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                onBlur={() => (draft.url ?? "") !== (task.url ?? "") && save({ url: draft.url || null })}
                className={taskInputClass} />
            </Field>
          </div>

          <Field label="Acceptance criteria">
            <Textarea value={draft.acceptance_criteria ?? ""} rows={3}
              placeholder="What must be true for this task to be considered done?"
              onChange={(e) => setDraft({ ...draft, acceptance_criteria: e.target.value })}
              onBlur={() => (draft.acceptance_criteria ?? "") !== (task.acceptance_criteria ?? "") && save({ acceptance_criteria: draft.acceptance_criteria })}
              className={taskInputClass} />
          </Field>

          <Field label="Manual prerequisites">
            <Textarea value={draft.manual_prereqs ?? ""} rows={2}
              placeholder="Human-only blockers (access, approvals, vendor calls…)"
              onChange={(e) => setDraft({ ...draft, manual_prereqs: e.target.value })}
              onBlur={() => (draft.manual_prereqs ?? "") !== (task.manual_prereqs ?? "") && save({ manual_prereqs: draft.manual_prereqs })}
              className={taskInputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Design URL">
              <Input value={draft.design_url ?? ""}
                placeholder="Figma / comps / brand kit"
                onChange={(e) => setDraft({ ...draft, design_url: e.target.value })}
                onBlur={() => (draft.design_url ?? "") !== (task.design_url ?? "") && save({ design_url: draft.design_url || null })}
                className={taskInputClass} />
            </Field>
            <Field label="Size">
              <Select value={draft.size ?? "none"} onValueChange={(v) => { const s = v === "none" ? null : (v as TaskSize); setDraft({ ...draft, size: s }); save({ size: s }); }}>
                <SelectTrigger className={`${taskInputClass} [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                <SelectContent className={taskSelectContentClass}>
                  <SelectItem value="none">—</SelectItem>
                  {TASK_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Platform">
              <Select value={draft.platform ?? "none"} onValueChange={(v) => { const p = v === "none" ? null : (v as TaskPlatform); setDraft({ ...draft, platform: p }); save({ platform: p }); }}>
                <SelectTrigger className={`${taskInputClass} [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                <SelectContent className={taskSelectContentClass}>
                  <SelectItem value="none">—</SelectItem>
                  {TASK_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Blocked by (task IDs)">
              <Input
                value={(draft.blocked_by ?? []).join(", ")}
                placeholder="Comma-separated task UUIDs"
                onChange={(e) => setDraft({ ...draft, blocked_by: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                onBlur={() => save({ blocked_by: draft.blocked_by ?? [] })}
                className={taskInputClass} />
            </Field>
          </div>

          <Field label="Tags (comma separated)">
            <Input value={draft.tags.join(", ")}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              onBlur={() => save({ tags: draft.tags })}
              className={taskInputClass} />
          </Field>

          {/* Attachments */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={subLabel}>Attachments</span>
              <label className="text-xs !text-warm-white cursor-pointer hover:underline">
                + Upload
                <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAttachment(f); e.target.value = ""; }} />
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(task.attachments ?? []).map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 4 }}>
                  <a href={a.signed_url} target="_blank" rel="noreferrer" className="text-xs !text-warm-white hover:!text-warm-white/80 inline-flex items-center gap-2">
                    <Paperclip size={11} /> {a.file_name}
                  </a>
                  <button onClick={async () => { await tasksApi.deleteAttachment(a.id); await onChanged(); }} className="!text-warm-white/70 hover:!text-destructive"><X size={12} /></button>
                </div>
              ))}
              {(task.attachments?.length ?? 0) === 0 && <div className="text-xs !text-warm-white/70">No attachments.</div>}
            </div>
          </div>

          {/* Subtasks */}
          {!task.parent_task_id && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={subLabel}>Subtasks</span>
                <button onClick={addSubtask} className="text-xs !text-warm-white hover:underline">+ Add subtask</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {subtasks.map((st) => (
                  <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_COLORS[st.status] }} />
                    <span className="text-xs !text-warm-white flex-1 truncate">{st.name}</span>
                    <Select value={st.status} onValueChange={(v) => tasksApi.update(st.id, { status: v as TaskStatus }).then(onChanged)}>
                      <SelectTrigger className={`${taskInputClass} h-7 w-[140px] text-xs [&_*]:!text-warm-white`}><SelectValue /></SelectTrigger>
                      <SelectContent className={taskSelectContentClass}>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                    <button onClick={async () => { if (confirm("Delete subtask?")) { await tasksApi.remove(st.id); await onChanged(); } }} className="!text-warm-white/70 hover:!text-destructive"><X size={12} /></button>
                  </div>
                ))}
                {subtasks.length === 0 && <div className="text-xs !text-warm-white/70">No subtasks.</div>}
              </div>
            </div>
          )}

          {saving && <div className="text-xs !text-warm-white/70">Saving…</div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={subLabel}>{label}</div>
      {children}
    </div>
  );
}
const subLabel: React.CSSProperties = {
  fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "hsl(var(--warm-white))", marginBottom: 6,
};

/* ---------------- New task dialog ---------------- */

function NewTaskDialog({ open, onOpenChange, epics, clientProjectId, onCreated }: {
  open: boolean; onOpenChange: (b: boolean) => void; epics: Epic[]; clientProjectId: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("backlog");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [epicId, setEpicId] = useState<string | null>(null);
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>("unassigned");
  const [dueDate, setDueDate] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [tagList, setTagList] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(""); setDescription(""); setStatus("backlog"); setPriority("normal");
    setEpicId(null); setAssigneeKind("unassigned"); setDueDate(""); setUrl("");
    setTagList([]); setFiles([]);
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const { task } = await tasksApi.create({
        client_project_id: clientProjectId,
        name: name.trim(),
        description: description || null,
        status, priority,
        epic_id: epicId,
        assignee_kind: assigneeKind,
        due_date: dueDate || null,
        url: url || null,
        tags: tagList,
      });
      // Upload staged files after task exists
      for (const f of files) {
        try { await tasksApi.uploadAttachment(task.id, f); }
        catch (e) { toast.error(`Upload failed: ${f.name}`); }
      }
      await onCreated(); reset(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create failed"); }
    finally { setSubmitting(false); }
  };

  const inputCls = taskInputClass;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={`${taskSurfaceClass} max-w-3xl w-[92vw] max-h-[88vh] overflow-y-auto p-0`}
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-warm-white/20">
          <DialogTitle className="!text-warm-white text-base font-normal tracking-[0.12em] uppercase">
            New task
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <Input
            autoFocus
            placeholder="Task name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} text-lg h-12 border-0 border-b rounded-none px-0 focus-visible:ring-0`}
          />

          <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 items-center text-sm">
            <span style={subLabel} className="!m-0">Status</span>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className={taskSelectContentClass}>
                {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>

            <span style={subLabel} className="!m-0">Priority</span>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className={taskSelectContentClass}>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

            <span style={subLabel} className="!m-0">Assignee</span>
            <Select value={assigneeKind} onValueChange={(v) => setAssigneeKind(v as AssigneeKind)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className={taskSelectContentClass}>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="claude">🤖 Claude</SelectItem>
              </SelectContent>
            </Select>

            <span style={subLabel} className="!m-0">Epic</span>
            <EpicCombobox
              epics={epics}
              value={epicId}
              onChange={setEpicId}
              clientProjectId={clientProjectId}
              inputCls={inputCls}
            />

            <span style={subLabel} className="!m-0">Due date</span>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />

            <span style={subLabel} className="!m-0">URL</span>
            <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />

            <span style={subLabel} className="!m-0">Tags</span>
            <TagsInput value={tagList} onChange={setTagList} inputCls={inputCls} />

            <span style={subLabel} className="!m-0">Attachments</span>
            <AttachmentsPicker files={files} onChange={setFiles} />
          </div>

          <div>
            <div style={subLabel}>Description</div>
            <Textarea
              placeholder="Add a description, acceptance criteria, links…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={7}
              className={inputCls}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-warm-white/20 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="bg-accent !text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? "Creating…" : "Create task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Epic combobox (search + create inline) ---------------- */

function EpicCombobox({ epics, value, onChange, clientProjectId, inputCls }: {
  epics: Epic[]; value: string | null; onChange: (id: string | null) => void;
  clientProjectId: string; inputCls: string;
}) {
  const selected = value ? epics.find((e) => e.id === value) : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = epics.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const exact = epics.find((e) => e.name.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 0 && !exact;

  const create = async () => {
    setCreating(true);
    try {
      const { epic } = await tasksApi.createEpic(clientProjectId, query.trim());
      onChange(epic.id);
      setQuery(""); setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create epic failed"); }
    finally { setCreating(false); }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} h-10 w-full rounded-md border px-3 text-left text-sm flex items-center justify-between`}
      >
        <span className={selected ? "" : "!text-warm-white/60"}>
          {selected ? selected.name : "No epic"}
        </span>
        <span className="!text-warm-white/60 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-warm-white/20 bg-ink shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or create epic…"
            className="w-full bg-transparent border-b border-warm-white/20 px-3 py-2 text-sm !text-warm-white placeholder:!text-taupe outline-none"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(null); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-warm-white/5 !text-warm-white/70">
              No epic
            </button>
            {filtered.map((e) => (
              <button key={e.id} type="button"
                onClick={() => { onChange(e.id); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-warm-white/5 flex items-center gap-2 !text-warm-white">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color ?? "hsl(var(--accent))" }} />
                {e.name}
              </button>
            ))}
            {canCreate && (
              <button type="button" onClick={create} disabled={creating}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-warm-white/5 border-t border-warm-white/10 !text-warm-white">
                {creating ? "Creating…" : `+ Create "${query.trim()}"`}
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div className="px-3 py-2 text-xs !text-warm-white/60">No epics.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Tags chip input ---------------- */

function TagsInput({ value, onChange, inputCls }: {
  value: string[]; onChange: (tags: string[]) => void; inputCls: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) { add(draft); setDraft(""); }
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={`${inputCls} min-h-10 w-full rounded-md border px-2 py-1.5 flex flex-wrap gap-1.5 items-center`}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warm-white/10 text-xs !text-warm-white">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))}
            className="!text-warm-white/60 hover:!text-warm-white"><X size={10} /></button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => { if (draft.trim()) { add(draft); setDraft(""); } }}
        placeholder={value.length === 0 ? "Type and press Enter…" : ""}
        className="flex-1 min-w-[120px] bg-transparent text-sm !text-warm-white placeholder:!text-taupe outline-none"
      />
    </div>
  );
}

/* ---------------- Attachments picker (staged before create) ---------------- */

function AttachmentsPicker({ files, onChange }: {
  files: File[]; onChange: (files: File[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-warm-white/30 rounded-md cursor-pointer hover:bg-warm-white/5 !text-warm-white/70 text-sm w-fit">
        <Paperclip size={14} />
        <span>Add files</span>
        <input
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length) onChange([...files, ...picked]);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="flex flex-col gap-1">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center justify-between px-2 py-1 rounded border border-warm-white/20 text-xs !text-warm-white">
              <span className="inline-flex items-center gap-2 truncate">
                <Paperclip size={11} /> {f.name}
                <span className="!text-warm-white/60">({Math.round(f.size / 1024)} KB)</span>
              </span>
              <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="!text-warm-white/60 hover:!text-destructive"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ---------------- Epic manager ---------------- */

function EpicManagerDialog({ open, onOpenChange, epics, clientProjectId, onChanged }: {
  open: boolean; onOpenChange: (b: boolean) => void; epics: Epic[]; clientProjectId: string;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#a87a3a");

  const create = async () => {
    if (!name.trim()) return;
    try {
      await tasksApi.createEpic(clientProjectId, name.trim(), color);
      setName("");
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={taskSurfaceClass}>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-light text-warm-white">
            Manage epics
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            {epics.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded border border-warm-white/10 p-2 text-warm-white">
                <input type="color" defaultValue={e.color ?? "#a87a3a"}
                  onChange={(ev) => tasksApi.updateEpic(e.id, { color: ev.target.value }).then(onChanged)}
                  className="h-6 w-6 bg-transparent border-0 cursor-pointer" />
                <Input defaultValue={e.name}
                  onBlur={(ev) => ev.target.value !== e.name && tasksApi.updateEpic(e.id, { name: ev.target.value }).then(onChanged)}
                  className={taskInputClass} />
                <button onClick={async () => { if (confirm(`Delete epic "${e.name}"?`)) { await tasksApi.deleteEpic(e.id); await onChanged(); } }}
                  className="!text-warm-white/70 hover:!text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
            {epics.length === 0 && <div className="text-xs !text-warm-white/70">No epics yet.</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-warm-white/10 pt-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="h-9 w-9 bg-transparent border-0 cursor-pointer" />
            <Input placeholder="New epic name" value={name} onChange={(e) => setName(e.target.value)}
              className={taskInputClass} />
            <Button onClick={create} disabled={!name.trim()}
              className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus size={14} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
