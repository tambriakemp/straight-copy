import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LayoutGrid, List, Plus, Trash2, X, ExternalLink, Paperclip, Calendar, Tag, Flag, Copy, ChevronDown, Upload, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
  TASK_SIZES, TASK_PLATFORMS, MENTIONABLE_HANDLES,
  type Task, type Epic, type TaskStatus, type TaskPriority, type AssigneeKind,
  type TaskSize, type TaskPlatform, type AcceptanceCriterion, type TaskActivity, type TaskComment,
  type ProjectLookup,
} from "./tasksApi";


const ASSIGNEE_LABEL: Record<AssigneeKind, string> = {
  unassigned: "Unassigned",
  admin: "👤 Admin",
  claude: "🤖 Claude",
  auto: "⚙️ Auto",
  client: "🧑 Client",
  agency: "🏛 Agency",
};
const ASSIGNEE_OPTIONS: AssigneeKind[] = ["unassigned", "auto", "client", "agency", "admin", "claude"];

interface Props { clientProjectId?: string }

type ViewMode = "kanban" | "list" | "calendar";

const taskSurfaceClass = "bg-ink border-warm-white/15 !text-warm-white [&_*]:!text-warm-white [&_input]:!text-warm-white [&_textarea]:!text-warm-white [&_input::placeholder]:!text-taupe [&_textarea::placeholder]:!text-taupe";
const taskInputClass = "bg-transparent border-warm-white/20 !text-warm-white placeholder:!text-taupe";
const taskSelectContentClass = "bg-ink border-warm-white/15 !text-warm-white [&_*]:!text-warm-white";

export default function ProjectTasksPanel({ clientProjectId }: Props) {
  const aggregated = !clientProjectId;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [projectLookup, setProjectLookup] = useState<ProjectLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("kanban");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [epicsOpen, setEpicsOpen] = useState(false);
  const [filterEpic, setFilterEpic] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [projectType, setProjectType] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const reload = async () => {
    try {
      const data = aggregated
        ? await tasksApi.listAll()
        : await tasksApi.list(clientProjectId!);
      setTasks(data.tasks);
      setEpics(data.epics);
      setProjectLookup(data.projects ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!aggregated) {
      supabase.from("client_projects").select("type").eq("id", clientProjectId!).maybeSingle()
        .then(({ data }) => setProjectType(data?.type ?? null));
    }
    const channelName = aggregated ? `project_tasks_all` : `project_tasks_${clientProjectId}`;
    const taskFilter = aggregated ? undefined : { filter: `client_project_id=eq.${clientProjectId}` };
    const ch = supabase.channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_tasks", ...(taskFilter ?? {}) },
        () => { void reload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "project_task_epics", ...(taskFilter ?? {}) },
        () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProjectId]);

  const handleSeedWebDev = async () => {
    if (!clientProjectId) return;
    if (!confirm("Seed the full Web Dev backlog (7 epics, 50 tasks) into this project?")) return;
    setSeeding(true);
    try {
      const result = await tasksApi.seedWebDev(clientProjectId);
      if (result.seeded) {
        toast.success(`Seeded ${result.epics} epics and ${result.tasks} tasks`);
        await reload();
      } else {
        toast.info(`Already seeded (${result.reason ?? "no-op"})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) for (const tag of t.tags ?? []) if (tag) s.add(tag);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const projectsById = useMemo(() => {
    const m = new Map<string, ProjectLookup>();
    for (const p of projectLookup) m.set(p.id, p);
    return m;
  }, [projectLookup]);

  const topLevel = useMemo(
    () => tasks.filter((t) => !t.parent_task_id)
      .filter((t) => filterEpic === "all" || t.epic_id === filterEpic || (filterEpic === "none" && !t.epic_id))
      .filter((t) => filterAssignee === "all" || t.assignee_kind === filterAssignee)
      .filter((t) => filterTag === "all" || (t.tags ?? []).includes(filterTag))
      .filter((t) => !aggregated || filterClient === "all" || t.client_project_id === filterClient),
    [tasks, filterEpic, filterAssignee, filterTag, filterClient, aggregated],
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
    const overId = e.over?.id != null ? String(e.over.id) : null;
    if (!overId || overId === taskId) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;

    let targetStatus: TaskStatus;
    let overTask: Task | undefined;
    if ((TASK_STATUSES as readonly string[]).includes(overId)) {
      targetStatus = overId as TaskStatus;
    } else {
      overTask = tasks.find((x) => x.id === overId);
      if (!overTask) return;
      targetStatus = overTask.status;
    }

    // Build new ordering for the target column (top-level only, excluding the dragged task)
    const targetCol = topLevel
      .filter((x) => x.status === targetStatus && x.id !== taskId)
      .sort((a, b) => a.order_index - b.order_index);
    const insertIdx = overTask ? Math.max(0, targetCol.findIndex((x) => x.id === overTask!.id)) : targetCol.length;
    const newCol = [...targetCol];
    newCol.splice(insertIdx, 0, { ...t, status: targetStatus });

    const statusChanged = t.status !== targetStatus;
    const updates: Array<{ id: string; order_index: number; status?: TaskStatus }> = [];
    newCol.forEach((task, idx) => {
      const newIdx = idx + 1;
      const isMoved = task.id === taskId;
      if (task.order_index !== newIdx || (isMoved && statusChanged)) {
        updates.push({
          id: task.id,
          order_index: newIdx,
          ...(isMoved && statusChanged ? { status: targetStatus } : {}),
        });
      }
    });
    if (updates.length === 0) return;

    // Optimistic
    setTasks((prev) => prev.map((x) => {
      const u = updates.find((u) => u.id === x.id);
      if (!u) return x;
      return { ...x, order_index: u.order_index, ...(u.status ? { status: u.status } : {}) };
    }));

    try {
      await Promise.all(updates.map((u) =>
        tasksApi.update(u.id, { order_index: u.order_index, ...(u.status ? { status: u.status } : {}) }),
      ));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move task");
      void reload();
    }
  };

  const kanbanWrapRef = useRef<HTMLDivElement | null>(null);
  const [kanbanHeight, setKanbanHeight] = useState<number>(600);
  useLayoutEffect(() => {
    if (view !== "kanban") return;
    const compute = () => {
      const el = kanbanWrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const next = Math.max(360, window.innerHeight - top - 16);
      setKanbanHeight(next);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [view, loading]);

  return (
    <div className="text-warm-white">
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setView("kanban")} style={tabBtnStyle(view === "kanban")}>
            <LayoutGrid size={14} style={{ marginRight: 6 }} /> Kanban
          </button>
          <button onClick={() => setView("list")} style={tabBtnStyle(view === "list")}>
            <List size={14} style={{ marginRight: 6 }} /> List
          </button>
          <button onClick={() => setView("calendar")} style={tabBtnStyle(view === "calendar")}>
            <CalendarDays size={14} style={{ marginRight: 6 }} /> Calendar
          </button>
        </div>

        {aggregated && (
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-[220px] bg-transparent border-warm-white/20 !text-warm-white [&_*]:!text-warm-white">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent className={taskSelectContentClass}>
              <SelectItem value="all">All clients</SelectItem>
              {projectLookup
                .slice()
                .sort((a, b) => (a.client_name ?? "").localeCompare(b.client_name ?? ""))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {(p.client_name ?? "Unnamed")} — {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

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
          <SelectTrigger className="w-[160px] bg-transparent border-warm-white/20 !text-warm-white [&_*]:!text-warm-white">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent className={taskSelectContentClass}>
            <SelectItem value="all">All assignees</SelectItem>
            {ASSIGNEE_OPTIONS.map((a) => <SelectItem key={a} value={a}>{ASSIGNEE_LABEL[a]}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-[160px] bg-transparent border-warm-white/20 !text-warm-white [&_*]:!text-warm-white">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent className={taskSelectContentClass}>
            <SelectItem value="all">All tags</SelectItem>
            {allTags.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 13, color: "hsl(var(--warm-white) / 0.5)" }}>No tags yet</div>
            ) : (
              allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)
            )}
          </SelectContent>
        </Select>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {!aggregated && projectType === "web_development" && tasks.length === 0 && !loading && (
            <Button variant="outline" size="sm" onClick={handleSeedWebDev} disabled={seeding}
              className="bg-transparent border-accent/40 !text-accent hover:bg-accent/10">
              {seeding ? "Seeding…" : "Seed Web Dev tasks"}
            </Button>
          )}
          {!aggregated && (
            <Button variant="outline" size="sm" onClick={() => setEpicsOpen(true)}
              className="bg-transparent border-warm-white/20 !text-warm-white hover:bg-warm-white/10">
              Manage epics
            </Button>
          )}
          {!aggregated && (
            <Button size="sm" disabled={creating} onClick={async () => {
              setCreating(true);
              try {
                const { task } = await tasksApi.create({
                  client_project_id: clientProjectId!,
                  name: "Untitled task",
                });
                await reload();
                setOpenTaskId(task.id);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Create failed");
              } finally {
                setCreating(false);
              }
            }} className="bg-accent !text-accent-foreground hover:bg-accent/90">
              <Plus size={14} style={{ marginRight: 6 }} /> {creating ? "Creating…" : "New task"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-warm-white/70">Loading tasks…</div>
      ) : view === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div
            ref={kanbanWrapRef}
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(260px, 1fr)",
              gap: 12,
              overflowX: "auto",
              overflowY: "hidden",
              height: kanbanHeight,
              paddingBottom: 4,
            }}
          >
            {TASK_STATUSES.map((s) => (
              <KanbanColumn key={s} status={s}
                tasks={topLevel.filter((t) => t.status === s).sort((a, b) => a.order_index - b.order_index)}
                subtasksByParent={subtasksByParent}
                epics={epics}
                onOpen={setOpenTaskId}
                projectsById={aggregated ? projectsById : undefined}
              />
            ))}
          </div>
          <DragOverlay>
            {dragId ? (() => {
              const t = tasks.find((x) => x.id === dragId);
              return t ? <TaskCard task={t} epics={epics} subtaskCount={(subtasksByParent.get(t.id) ?? []).length} dragging projectsById={aggregated ? projectsById : undefined} /> : null;
            })() : null}
          </DragOverlay>
        </DndContext>
      ) : view === "list" ? (
        <ListView tasks={topLevel} epics={epics} subtasksByParent={subtasksByParent} onOpen={setOpenTaskId} onChanged={reload} projectsById={aggregated ? projectsById : undefined} />
      ) : (
        <CalendarView tasks={topLevel} onOpen={setOpenTaskId} projectsById={aggregated ? projectsById : undefined} />
      )}

      {openTask && (
        <TaskDetailSheet
          task={openTask}
          epics={epics}
          subtasks={subtasksByParent.get(openTask.id) ?? []}
          onClose={() => setOpenTaskId(null)}
          onOpenTask={setOpenTaskId}
          onChanged={reload}
          clientProjectId={openTask.client_project_id}
        />
      )}


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
  status, tasks, subtasksByParent, epics, onOpen, projectsById,
}: {
  status: TaskStatus; tasks: Task[]; subtasksByParent: Map<string, Task[]>; epics: Epic[];
  onOpen: (id: string) => void;
  projectsById?: Map<string, ProjectLookup>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} style={{
      background: isOver ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
      border: "1px solid hsl(var(--warm-white) / 0.12)",
      borderRadius: 8,
      padding: 10,
      height: "100%",
      minHeight: 0,
      display: "flex", flexDirection: "column", gap: 8,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 8px", flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_COLORS[status] }} />
        <span style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--warm-white))" }}>
          {STATUS_LABELS[status]}
        </span>
        <span style={{ marginLeft: "auto", color: "hsl(var(--warm-white) / 0.7)", fontSize: 14 }}>{tasks.length}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 2 }}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} epics={epics}
              subtaskCount={(subtasksByParent.get(t.id) ?? []).length} onOpen={onOpen}
              projectsById={projectsById} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function TaskEmailSection({ task, onChanged }: { task: Task; onChanged: () => Promise<void> | void }) {
  const [sending, setSending] = useState(false);
  const tpl = task.email_template!;
  const isAuto = tpl.trigger === "auto";
  const send = async () => {
    if (!confirm(`Send "${tpl.template_key}" email to client now?`)) return;
    setSending(true);
    try {
      const res = await tasksApi.sendWebDevEmail(task.id);
      if (res.ok) toast.success(`Sent to ${res.recipient}`);
      else toast.error("Send failed");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="tp-sec" style={{ borderTop: "1px solid hsl(var(--warm-white) / 0.1)", paddingTop: 16, marginTop: 8 }}>
      <div className="tp-label" style={{ marginBottom: 8 }}>SureContact email</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Badge variant="outline" className="border-warm-white/20 !text-warm-white">
          {tpl.template_key}
        </Badge>
        <Badge variant="outline" className={isAuto ? "border-accent/40 !text-accent" : "border-warm-white/20 !text-warm-white"}>
          {isAuto ? "Auto-fires from server event" : "Agency triggered"}
        </Badge>
        {tpl.sent_at && (
          <span className="!text-warm-white/70" style={{ fontSize: 12 }}>
            Last sent: {new Date(tpl.sent_at).toLocaleString()}
          </span>
        )}
        {!isAuto && (
          <Button size="sm" onClick={send} disabled={sending}
            className="bg-accent !text-accent-foreground hover:bg-accent/90 ml-auto">
            {sending ? "Sending…" : tpl.sent_at ? "Resend email" : "Send email"}
          </Button>
        )}
      </div>
      {tpl.last_send_error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "hsl(0 70% 65%)" }}>
          Last error: {tpl.last_send_error}
        </div>
      )}
    </section>
  );
}


function SortableCard({ task, epics, subtaskCount, onOpen }: {
  task: Task; epics: Epic[]; subtaskCount: number; onOpen: (id: string) => void;
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => { if (!isDragging) onOpen(task.id); }}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: PRIORITY_COLORS[task.priority] }}>
          <Flag size={11} /> {task.priority}
        </span>
        {task.assignee_kind !== "unassigned" && (
          <span style={{ fontSize: 13, color: "hsl(var(--warm-white) / 0.7)" }}>
            {ASSIGNEE_LABEL[task.assignee_kind]}
          </span>
        )}
        {task.due_date && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "hsl(var(--warm-white) / 0.7)" }}>
            <Calendar size={11} /> {task.due_date}
          </span>
        )}
        {subtaskCount > 0 && (
          <span style={{ fontSize: 13, color: "hsl(var(--warm-white) / 0.7)" }}>{subtaskCount} subtask{subtaskCount > 1 ? "s" : ""}</span>
        )}
        {task.url && <ExternalLink size={11} style={{ color: "hsl(var(--warm-white) / 0.7)" }} />}
        {(task.attachments?.length ?? 0) > 0 && <Paperclip size={11} style={{ color: "hsl(var(--warm-white) / 0.7)" }} />}
        {task.tags?.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[11px] py-0 px-1.5 border-warm-white/15 !text-warm-white/70">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/* ---------------- List view ---------------- */

function ListView({ tasks, epics, subtasksByParent, onOpen, onChanged }: {
  tasks: Task[]; epics: Epic[]; subtasksByParent: Map<string, Task[]>;
  onOpen: (id: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<TaskStatus | "">("");
  const [applying, setApplying] = useState(false);

  // Drop stale ids when the underlying list changes
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(tasks.map((t) => t.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (ids.has(id)) next.add(id); });
      return next;
    });
  }, [tasks]);

  const allChecked = tasks.length > 0 && selected.size === tasks.length;
  const someChecked = selected.size > 0 && !allChecked;

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(tasks.map((t) => t.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus || selected.size === 0) return;
    setApplying(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map((id) => tasksApi.update(id, { status: bulkStatus as TaskStatus })));
      toast.success(`Updated ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      setBulkStatus("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setApplying(false);
    }
  };

  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const toggleGroup = (s: TaskStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const grouped = TASK_STATUSES.map((s) => ({
    status: s,
    items: tasks.filter((t) => t.status === s),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 10,
          border: "1px solid hsl(var(--warm-white) / 0.18)", borderRadius: 8,
          background: "rgba(255,255,255,0.04)", color: "hsl(var(--warm-white))", fontSize: 14,
        }}>
          <span style={{ letterSpacing: "0.06em" }}>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as TaskStatus | "")}
            style={{
              background: "hsl(40 8% 10%)", color: "hsl(var(--warm-white))",
              border: "1px solid hsl(var(--warm-white) / 0.18)", padding: "6px 10px",
              fontSize: 13, borderRadius: 4,
            }}
          >
            <option value="">Change status…</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <Button size="sm" disabled={!bulkStatus || applying} onClick={applyBulkStatus}
            className="bg-accent !text-accent-foreground hover:bg-accent/90">
            {applying ? "Applying…" : "Apply"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {grouped.map(({ status, items }) => {
          const isCollapsed = collapsed.has(status);
          const groupIds = items.map((t) => t.id);
          const groupAllSel = groupIds.every((id) => selected.has(id));
          const groupSomeSel = !groupAllSel && groupIds.some((id) => selected.has(id));
          const toggleGroupSel = () => {
            setSelected((prev) => {
              const next = new Set(prev);
              if (groupAllSel) groupIds.forEach((id) => next.delete(id));
              else groupIds.forEach((id) => next.add(id));
              return next;
            });
          };
          return (
            <div key={status} style={{ border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 8, overflow: "hidden" }}>
              <div
                onClick={() => toggleGroup(status)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: "rgba(255,255,255,0.04)", cursor: "pointer",
                  borderBottom: isCollapsed ? "none" : "1px solid hsl(var(--warm-white) / 0.12)",
                }}
              >
                <span style={{ color: "hsl(var(--warm-white) / 0.7)", fontSize: 11, width: 12, display: "inline-block" }}>
                  {isCollapsed ? "▸" : "▾"}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "3px 10px", borderRadius: 4,
                  background: STATUS_COLORS[status], color: "hsl(40 8% 10%)",
                  fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600,
                }}>
                  {STATUS_LABELS[status]}
                </span>
                <span style={{ color: "hsl(var(--warm-white) / 0.6)", fontSize: 13 }}>{items.length}</span>
              </div>
              {!isCollapsed && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)", color: "hsl(var(--warm-white) / 0.7)", textAlign: "left", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      <th style={{ ...th, width: 36 }}>
                        <input
                          type="checkbox"
                          checked={groupAllSel}
                          ref={(el) => { if (el) el.indeterminate = groupSomeSel; }}
                          onChange={toggleGroupSel}
                          aria-label={`Select all ${STATUS_LABELS[status]}`}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      <th style={th}>Name</th><th style={th}>Priority</th>
                      <th style={th}>Epic</th><th style={th}>Assignee</th><th style={th}>Due</th><th style={th}>Subs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => {
                      const isSel = selected.has(t.id);
                      return (
                        <tr key={t.id}
                          style={{
                            borderTop: "1px solid hsl(var(--warm-white) / 0.12)",
                            color: "hsl(var(--warm-white))",
                            cursor: "pointer",
                            background: isSel ? "rgba(255,255,255,0.04)" : undefined,
                          }}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('input[type="checkbox"]')) return;
                            onOpen(t.id);
                          }}
                        >
                          <td style={td} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleOne(t.id)}
                              aria-label={`Select ${t.name}`}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={td}>{t.name}</td>
                          <td style={{ ...td, color: PRIORITY_COLORS[t.priority] }}>{t.priority}</td>
                          <td style={td}>{epics.find((e) => e.id === t.epic_id)?.name ?? "—"}</td>
                          <td style={td}>{t.assignee_kind}</td>
                          <td style={td}>{t.due_date ?? "—"}</td>
                          <td style={td}>{(subtasksByParent.get(t.id) ?? []).length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "hsl(var(--warm-white) / 0.7)", border: "1px solid hsl(var(--warm-white) / 0.12)", borderRadius: 8 }}>
            No tasks.
          </div>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px" };
const td: React.CSSProperties = { padding: "10px 12px" };
const subLabel: React.CSSProperties = {
  fontSize: 13,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "hsl(var(--warm-white))",
  marginBottom: 6,
};

/* ---------------- Task detail sheet ---------------- */

// ============================================================
// TaskDetailSheet — editorial side-panel redesign
// 720px wide on desktop, collapses to full-width under 768px.
// Scoped via the tp- class prefix so it doesn't leak globally.
// ============================================================

const TASK_PANEL_STYLE = `
.tp-root { --tp-panel-w: 720px; --tp-row-gap: 22px; --tp-field-h: 46px; --tp-sec-gap: 38px;
  --tp-border: hsl(40 20% 97% / 0.08); --tp-border-strong: hsl(40 20% 97% / 0.18);
  --tp-accent: hsl(30 25% 44%); --tp-ink: hsl(40 8% 10%); --tp-charcoal: hsl(36 5% 16%);
  --tp-warm: hsl(40 20% 97%); --tp-stone: hsl(30 10% 78%); --tp-taupe: hsl(30 8% 62%);
  --tp-serif: 'Cormorant Garamond','EB Garamond',Georgia,serif;
  --tp-sans: 'Karla','Inter',system-ui,sans-serif;
  position: relative; height: 100%; width: 100%;
  background: var(--tp-charcoal); color: var(--tp-warm);
  font-family: var(--tp-sans); font-weight: 300;
  display: flex; flex-direction: column;
}
.tp-root::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px;
  background: linear-gradient(to bottom, var(--tp-accent), hsl(30 25% 44% / 0) 55%); pointer-events:none; }
.tp-header { flex-shrink:0; padding: 22px 38px 20px; border-bottom: 1px solid var(--tp-border);
  background: linear-gradient(to bottom, var(--tp-charcoal), hsl(36 5% 16% / 0.96));
  position: relative; z-index: 4; }
.tp-h-top { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.tp-eyebrow { display:flex; align-items:center; gap:14px; font-size:10px; letter-spacing:0.32em;
  text-transform:uppercase; color: var(--tp-stone); }
.tp-id { display:inline-flex; align-items:center; gap:8px; font: inherit; font-size:10px;
  letter-spacing:0.12em; color: var(--tp-taupe); cursor:pointer; padding:5px 10px;
  border:1px solid var(--tp-border); background: var(--tp-ink); white-space:nowrap;
  transition: color .3s, border-color .3s; }
.tp-id:hover { color: var(--tp-warm); border-color: var(--tp-accent); }
.tp-id svg { width:11px; height:11px; opacity:0.8; }
.tp-actions { display:flex; align-items:center; gap:10px; }
.tp-iconbtn { width:34px; height:34px; display:grid; place-items:center; background:transparent;
  border:1px solid var(--tp-border); color: var(--tp-stone); cursor:pointer;
  transition: color .3s, border-color .3s, background .3s; }
.tp-iconbtn:hover { color: var(--tp-warm); border-color: var(--tp-accent); }
.tp-iconbtn.tp-danger:hover { color: hsl(8 60% 70%); border-color: hsl(8 55% 50%); background: hsl(8 55% 50% / 0.08); }
.tp-iconbtn svg { width:15px; height:15px; }
.tp-statuschip { display:inline-flex; align-items:center; gap:9px; padding:7px 14px 7px 12px;
  border:1px solid var(--tp-border); font-size:10px; letter-spacing:0.22em;
  text-transform:uppercase; color: var(--tp-stone); white-space:nowrap; }
.tp-statuschip .d { width:8px; height:8px; border-radius:50%; background: var(--tp-accent);
  box-shadow: 0 0 0 4px hsl(30 25% 44% / 0.18); }

.tp-body { flex:1; min-height:0; overflow-y:auto; padding: 30px 38px 64px;
  display:flex; flex-direction:column; gap: var(--tp-sec-gap); }
.tp-body::-webkit-scrollbar { width:9px; }
.tp-body::-webkit-scrollbar-track { background: transparent; }
.tp-body::-webkit-scrollbar-thumb { background: hsl(40 20% 97% / 0.08); }
.tp-body::-webkit-scrollbar-thumb:hover { background: var(--tp-accent); }

.tp-hero { display:flex; flex-direction:column; gap:10px; }
.tp-hero-title { width:100%; background:transparent; border:0; outline:none;
  font-family: var(--tp-serif); font-weight:300; font-size:38px; line-height:1.06;
  color: var(--tp-warm); letter-spacing:-0.01em; padding:4px 0;
  border-bottom: 1px solid transparent; transition: border-color .3s; }
.tp-hero-title:focus { border-bottom-color: var(--tp-accent); }
.tp-hero-title::placeholder { color: var(--tp-taupe); font-style: italic; }

.tp-sec { display:flex; flex-direction:column; }
.tp-sec-head { display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding-bottom:14px; margin-bottom:22px; border-bottom: 1px solid var(--tp-border);
  cursor:pointer; user-select:none; }
.tp-sec-label { display:flex; align-items:center; gap:12px; font-size:10px; letter-spacing:0.32em;
  text-transform:uppercase; color: var(--tp-stone); }
.tp-sec-count { min-width:20px; height:20px; padding:0 6px; display:inline-grid; place-items:center;
  font-size:10px; letter-spacing:0.05em; color: var(--tp-taupe);
  border:1px solid var(--tp-border); background: var(--tp-ink); }
.tp-sec-right { display:flex; align-items:center; gap:14px; }
.tp-sec-chev { color: var(--tp-taupe); transition: transform .3s, color .3s; display:inline-flex; }
.tp-sec-head:hover .tp-sec-chev { color: var(--tp-stone); }
.tp-sec.is-collapsed .tp-sec-chev { transform: rotate(-90deg); }
.tp-sec.is-collapsed .tp-sec-body { display:none; }

.tp-addlink { display:inline-flex; align-items:center; gap:7px; background:transparent; border:0;
  cursor:pointer; font: inherit; font-size:10px; letter-spacing:0.22em; text-transform:uppercase;
  color: var(--tp-accent); transition: color .3s; }
.tp-addlink:hover { color: var(--tp-warm); }
.tp-addlink .plus { width:16px; height:16px; display:grid; place-items:center;
  border:1px solid currentColor; font-size:12px; line-height:1; }

.tp-grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: var(--tp-row-gap) 24px; }
.tp-field { display:flex; flex-direction:column; gap:9px; min-width:0; }
.tp-field--full { grid-column: 1 / -1; }
.tp-label { font-size:10px; letter-spacing:0.26em; text-transform:uppercase; color: var(--tp-taupe); }

.tp-input, .tp-select, .tp-textarea { width:100%; background: var(--tp-ink);
  border:1px solid var(--tp-border); color: var(--tp-warm); font-family: var(--tp-sans);
  font-weight:300; font-size:14px; letter-spacing:0.01em; outline:none;
  transition: border-color .3s, background .3s; }
.tp-input, .tp-select { height: var(--tp-field-h); padding: 0 16px; }
.tp-input:hover, .tp-select:hover, .tp-textarea:hover { border-color: var(--tp-border-strong); }
.tp-input:focus, .tp-select:focus, .tp-textarea:focus { border-color: var(--tp-accent); background: hsl(40 8% 8%); }
.tp-input::placeholder, .tp-textarea::placeholder { color: var(--tp-taupe); font-style: italic;
  font-family: var(--tp-serif); font-size:15px; }
.tp-textarea { padding:14px 16px; min-height:96px; line-height:1.7; resize: vertical; }
.tp-select { appearance:none; cursor:pointer; padding-right:38px;
  background-image: linear-gradient(45deg, transparent 50%, var(--tp-stone) 50%),
                    linear-gradient(135deg, var(--tp-stone) 50%, transparent 50%);
  background-position: calc(100% - 18px) center, calc(100% - 13px) center;
  background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.tp-select option { background: var(--tp-charcoal); color: var(--tp-warm); }
.tp-input[type=date] { color-scheme: dark; }

.tp-seg { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:3px; padding:3px;
  background: var(--tp-ink); border:1px solid var(--tp-border); height: var(--tp-field-h); }
.tp-seg-btn { background:transparent; border:0; cursor:pointer; color: var(--tp-taupe);
  font: inherit; font-size:10px; letter-spacing:0.14em; text-transform:uppercase;
  display:flex; align-items:center; justify-content:center; gap:7px;
  transition: all .3s; padding:0 4px; white-space:nowrap; }
.tp-seg-btn .d { width:7px; height:7px; border-radius:50%; background: currentColor; opacity:0.7; }
.tp-seg-btn:hover { color: var(--tp-stone); }
.tp-seg-btn.is-on { background: var(--tp-charcoal); color: var(--tp-warm); box-shadow: 0 1px 0 hsl(40 8% 4% / 0.4); }
.tp-seg-btn.is-on.t-prog { color: var(--tp-accent); }
.tp-seg-btn.is-on.t-review { color: hsl(265 30% 74%); }
.tp-seg-btn.is-on.t-high { color: hsl(8 60% 70%); }
.tp-seg-btn.is-on.t-urgent { color: hsl(8 70% 68%); }

.tp-glyph { position:relative; }
.tp-glyph .gly { position:absolute; left:14px; top:50%; transform:translateY(-50%);
  font-size:13px; pointer-events:none; color: var(--tp-stone); }
.tp-glyph .tp-select { padding-left:38px; }

.tp-tags { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.tp-tag { display:inline-flex; align-items:center; gap:8px; padding:7px 8px 7px 12px;
  background: var(--tp-ink); border:1px solid var(--tp-border);
  font-size:11px; letter-spacing:0.08em; color: var(--tp-stone); }
.tp-tag button { background:transparent; border:0; color: var(--tp-taupe); cursor:pointer;
  font-size:13px; line-height:1; padding:0; }
.tp-tag button:hover { color: hsl(8 60% 70%); }
.tp-tag-add { background:transparent; border:1px dashed var(--tp-border-strong); color: var(--tp-taupe);
  font-family: var(--tp-sans); font-size:12px; padding:7px 14px; cursor:pointer;
  letter-spacing:0.02em; transition: all .3s; }
.tp-tag-add:hover { color: var(--tp-warm); border-color: var(--tp-accent); }

.tp-rows { display:flex; flex-direction:column; gap:3px; }
.tp-row { display:flex; align-items:center; gap:14px; padding:14px 16px;
  background: var(--tp-ink); transition: background .3s; }
.tp-row:hover { background: hsl(36 5% 19%); }
.tp-row-box { width:18px; height:18px; flex-shrink:0; border:1px solid var(--tp-stone);
  display:grid; place-items:center; cursor:pointer; transition: all .3s; background: transparent; padding:0; }
.tp-row.is-done .tp-row-box { background: var(--tp-accent); border-color: var(--tp-accent); }
.tp-row.is-done .tp-row-box::after { content:'✓'; font-size:12px; color: var(--tp-warm); }
.tp-row-label { flex:1; font-size:14px; color: var(--tp-warm); background:transparent; border:0; outline:none;
  font: inherit; font-weight:300; padding:0; text-align:left; cursor:text; }
.tp-row.is-done .tp-row-label { color: var(--tp-taupe); text-decoration: line-through;
  text-decoration-color: hsl(40 20% 97% / 0.2); }
.tp-row-meta { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color: var(--tp-taupe); }
.tp-row-del { background:transparent; border:0; color: var(--tp-taupe); cursor:pointer; opacity:0;
  transition: all .3s; display:inline-flex; }
.tp-row:hover .tp-row-del { opacity:1; }
.tp-row-del:hover { color: hsl(8 60% 70%); }

.tp-addrow { display:flex; gap:10px; margin-top:10px; }
.tp-addrow .tp-input { flex:1; }
.tp-btn { display:inline-flex; align-items:center; gap:9px; flex-shrink:0;
  font: inherit; font-size:11px; letter-spacing:0.18em; text-transform:uppercase;
  padding:0 20px; height: var(--tp-field-h); cursor:pointer; border:1px solid var(--tp-border);
  color: var(--tp-warm); background: transparent; transition: all .3s; }
.tp-btn:hover { background: var(--tp-accent); border-color: var(--tp-accent); color: var(--tp-warm); }

.tp-empty { padding:22px; text-align:center; border:1px dashed hsl(40 20% 97% / 0.12);
  color: var(--tp-taupe); font-family: var(--tp-serif); font-style: italic; font-size:15px; }
.tp-empty--drop { cursor:pointer; transition: all .3s; }
.tp-empty--drop:hover { border-color: var(--tp-accent); color: var(--tp-stone); background: hsl(30 25% 44% / 0.05); }

.tp-att { display:flex; align-items:center; gap:14px; padding:13px 16px; background: var(--tp-ink); }
.tp-att-ic { width:34px; height:34px; display:grid; place-items:center; border:1px solid var(--tp-border);
  font-family: var(--tp-serif); font-style:italic; font-size:10px; color: var(--tp-stone); }
.tp-att-info { flex:1; display:flex; flex-direction:column; gap:3px; min-width:0; }
.tp-att-name { font-size:13px; color: var(--tp-warm); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tp-att-meta { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color: var(--tp-taupe); }
.tp-att a { color: inherit; text-decoration: none; }
.tp-att a:hover { color: var(--tp-accent); }

.tp-act { display:flex; flex-direction:column; gap:0; }
.tp-act-item { display:flex; gap:16px; padding:4px 0 18px; position:relative; }
.tp-act-rail { display:flex; flex-direction:column; align-items:center; }
.tp-act-dot { width:9px; height:9px; border-radius:50%; background: var(--tp-accent);
  margin-top:5px; flex-shrink:0; }
.tp-act-line { width:1px; flex:1; background: var(--tp-border); margin-top:4px; }
.tp-act-item:last-child .tp-act-line { display:none; }
.tp-act-body { display:flex; flex-direction:column; gap:4px; padding-bottom:4px; }
.tp-act-txt { font-size:13px; color: var(--tp-stone); }
.tp-act-time { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color: var(--tp-taupe); }

/* Comments */
.tp-comments { display:flex; flex-direction:column; gap:14px; }
.tp-comm-list { display:flex; flex-direction:column; gap:10px; }
.tp-comm { padding:12px 14px; border:1px solid var(--tp-border); border-radius:6px; background: rgba(255,255,255,0.02); }
.tp-comm-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
.tp-comm-author { font-size:12px; font-weight:600; color: var(--tp-stone); letter-spacing:0.04em; }
.tp-comm-time { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color: var(--tp-taupe); }
.tp-comm-tags { display:inline-flex; gap:4px; flex-wrap:wrap; }
.tp-mention-chip { font-size:10px; padding:2px 6px; border-radius:3px;
  background: rgba(120, 170, 220, 0.15); color: hsl(200 70% 75%); letter-spacing:0.04em; }
.tp-comm-body { font-size:13px; color: var(--tp-stone); white-space: pre-wrap; line-height:1.5; }
.tp-mention { color: hsl(200 70% 70%); background: rgba(120,170,220,0.10); padding:0 3px; border-radius:3px; }
.tp-comm-form { display:flex; flex-direction:column; gap:8px; margin-top:4px; }
.tp-comm-form-wrap { position:relative; }
.tp-comm-input { width:100%; min-height:72px; padding:10px 12px; resize:vertical;
  background: rgba(0,0,0,0.15); border:1px solid var(--tp-border); border-radius:6px;
  color: var(--tp-stone); font: inherit; font-size:13px; line-height:1.5; }
.tp-comm-input:focus { outline:none; border-color: var(--tp-accent); }
.tp-mention-pop { position:absolute; left:0; bottom:calc(100% + 4px);
  background: var(--tp-bg-elev, #1f1d1a); border:1px solid var(--tp-border);
  border-radius:6px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); z-index:50;
  display:flex; flex-direction:column; min-width:220px; overflow:hidden; }
.tp-mention-opt { display:flex; align-items:baseline; gap:8px; padding:8px 12px;
  text-align:left; background:transparent; border:0; cursor:pointer; color: var(--tp-stone);
  font-size:12px; }
.tp-mention-opt:hover { background: rgba(255,255,255,0.06); }
.tp-mention-opt-h { color: hsl(200 70% 70%); font-weight:600; }
.tp-mention-opt-l { color: var(--tp-stone); }
.tp-mention-opt-x { color: var(--tp-taupe); font-size:10px; margin-left:auto; }
.tp-comm-actions { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.tp-comm-hint { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color: var(--tp-taupe); }
.tp-btn { padding:6px 14px; font-size:11px; letter-spacing:0.18em; text-transform:uppercase;
  background:transparent; color: var(--tp-stone); border:1px solid var(--tp-border);
  border-radius:4px; cursor:pointer; transition: all 0.15s; }
.tp-btn:hover:not(:disabled) { border-color: var(--tp-accent); color: var(--tp-accent); }
.tp-btn:disabled { opacity:0.5; cursor:not-allowed; }


@media (max-width: 767px) {
  .tp-grid2 { grid-template-columns: 1fr; }
  .tp-header, .tp-body { padding-left: 22px; padding-right: 22px; }
  .tp-hero-title { font-size: 30px; }
}
`;

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  ready_for_claude: "Ready",
  in_progress: "In Progress",
  needs_review: "Needs Review",
  complete: "Complete",
  blocked: "Blocked",
};

const TASK_STATUS_TONE: Partial<Record<TaskStatus, string>> = {
  in_progress: "t-prog",
  needs_review: "t-review",
};
const PRIORITY_TONE: Partial<Record<TaskPriority, string>> = {
  high: "t-high",
  urgent: "t-urgent",
};

const ASSIGNEE_GLYPH: Record<AssigneeKind, string> = {
  unassigned: "·",
  admin: "◇",
  claude: "✦",
  auto: "⚙",
  client: "◉",
  agency: "⌂",
};

function TaskDetailSheet({
  task, epics, subtasks, onClose, onOpenTask, onChanged, clientProjectId,
}: {
  task: Task; epics: Epic[]; subtasks: Task[]; onClose: () => void; onChanged: () => Promise<void>;
  onOpenTask: (id: string) => void;
  clientProjectId: string;
}) {
  const [draft, setDraft] = useState<Task>(task);
  const [saving, setSaving] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

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

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(task.id);
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1400);
    } catch { toast.error("Copy failed"); }
  };

  const shortId = `CRE8-${task.id.slice(0, 8).toUpperCase()}`;
  const tags = draft.tags ?? [];
  const acItems = draft.acceptance_criteria ?? [];
  const attachments = task.attachments ?? [];
  const activity = task.activity ?? [];

  const addTagValue = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t) return;
    const current = draft.tags ?? [];
    if (current.includes(t)) return;
    const next = [...current, t];
    setDraft({ ...draft, tags: next });
    void save({ tags: next });
  };
  const removeTag = (t: string) => {
    const next = (draft.tags ?? []).filter((x) => x !== t);
    setDraft({ ...draft, tags: next });
    void save({ tags: next });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="p-0 border-0 bg-transparent w-full sm:max-w-[720px] shadow-[-40px_0_120px_-30px_hsl(40_8%_4%/0.7)]"
      >
        <style>{TASK_PANEL_STYLE}</style>
        <SheetHeader className="sr-only">
          <SheetTitle>Task detail</SheetTitle>
        </SheetHeader>
        <div className="tp-root">
          {/* Header */}
          <header className="tp-header">
            <div className="tp-h-top">
              <div className="tp-eyebrow">
                Task
                <button className="tp-id" onClick={copyId} type="button" title="Copy task ID">
                  <Copy size={11} />
                  <span>{idCopied ? "Copied" : shortId}</span>
                </button>
              </div>
              <div className="tp-actions">
                <span className="tp-statuschip">
                  <span className="d" style={{ background: STATUS_COLORS[draft.status] }} />
                  {TASK_STATUS_LABEL[draft.status]}
                </span>
                <button className="tp-iconbtn tp-danger" onClick={remove} title="Delete task" aria-label="Delete task">
                  <Trash2 />
                </button>
                <button className="tp-iconbtn" onClick={onClose} title="Close" aria-label="Close">
                  <X />
                </button>
              </div>
            </div>
          </header>

          {/* Body */}
          <div className="tp-body">
            {/* Hero */}
            <section className="tp-sec">
              <div className="tp-hero">
                <label className="tp-label" htmlFor="tp-name">Name</label>
                <input
                  id="tp-name"
                  className="tp-hero-title"
                  value={draft.name}
                  placeholder="Untitled task"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  onBlur={() => draft.name !== task.name && save({ name: draft.name })}
                />
              </div>
              <div className="tp-field" style={{ marginTop: 22 }}>
                <label className="tp-label" htmlFor="tp-desc">Description</label>
                <textarea
                  id="tp-desc"
                  className="tp-textarea"
                  value={draft.description ?? ""}
                  placeholder="Add context, goals, and anything the owner needs to know…"
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  onBlur={() => (draft.description ?? "") !== (task.description ?? "") && save({ description: draft.description })}
                />
              </div>
            </section>

            {/* SureContact email binding (Web Dev tasks) */}
            {task.email_template?.template_key && (
              <TaskEmailSection task={task} onChanged={onChanged} />
            )}

            {/* Details */}
            <Section title="Details" collapsed={collapsed.details} onToggle={() => toggle("details")}>
              <div className="tp-grid2">
                <div className="tp-field tp-field--full">
                  <span className="tp-label">Status</span>
                  <div className="tp-seg">
                    {TASK_STATUSES.map((s) => {
                      const on = draft.status === s;
                      const tone = on ? TASK_STATUS_TONE[s] ?? "" : "";
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`tp-seg-btn ${on ? "is-on" : ""} ${tone}`}
                          onClick={() => { setDraft({ ...draft, status: s }); save({ status: s }); }}
                        >
                          {on && <span className="d" />}{TASK_STATUS_LABEL[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="tp-field tp-field--full">
                  <span className="tp-label">Priority</span>
                  <div className="tp-seg">
                    {PRIORITIES.map((p) => {
                      const on = draft.priority === p;
                      const tone = on ? PRIORITY_TONE[p] ?? "" : "";
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`tp-seg-btn ${on ? "is-on" : ""} ${tone}`}
                          onClick={() => { setDraft({ ...draft, priority: p }); save({ priority: p }); }}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="tp-field">
                  <label className="tp-label" htmlFor="tp-assignee">Assignee</label>
                  <div className="tp-glyph">
                    <span className="gly">{ASSIGNEE_GLYPH[draft.assignee_kind]}</span>
                    <select
                      id="tp-assignee"
                      className="tp-select"
                      value={draft.assignee_kind}
                      onChange={(e) => { const v = e.target.value as AssigneeKind; setDraft({ ...draft, assignee_kind: v }); save({ assignee_kind: v }); }}
                    >
                      {ASSIGNEE_OPTIONS.map((k) => <option key={k} value={k}>{ASSIGNEE_LABEL[k]}</option>)}
                    </select>
                  </div>
                </div>

                <div className="tp-field">
                  <label className="tp-label" htmlFor="tp-epic">Epic</label>
                  <select
                    id="tp-epic"
                    className="tp-select"
                    value={draft.epic_id ?? ""}
                    onChange={(e) => { const id = e.target.value || null; setDraft({ ...draft, epic_id: id }); save({ epic_id: id }); }}
                  >
                    <option value="">None</option>
                    {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
                  </select>
                </div>

                <div className="tp-field">
                  <label className="tp-label" htmlFor="tp-due">Due date</label>
                  <input
                    id="tp-due"
                    className="tp-input"
                    type="date"
                    value={draft.due_date ?? ""}
                    onChange={(e) => setDraft({ ...draft, due_date: e.target.value || null })}
                    onBlur={() => (draft.due_date ?? "") !== (task.due_date ?? "") && save({ due_date: draft.due_date })}
                  />
                </div>

                <div className="tp-field">
                  <label className="tp-label" htmlFor="tp-size">Size</label>
                  <select
                    id="tp-size"
                    className="tp-select"
                    value={draft.size ?? ""}
                    onChange={(e) => { const s = (e.target.value || null) as TaskSize | null; setDraft({ ...draft, size: s }); save({ size: s }); }}
                  >
                    <option value="">—</option>
                    {TASK_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="tp-field">
                  <label className="tp-label" htmlFor="tp-platform">Platform</label>
                  <select
                    id="tp-platform"
                    className="tp-select"
                    value={draft.platform ?? ""}
                    onChange={(e) => { const p = (e.target.value || null) as TaskPlatform | null; setDraft({ ...draft, platform: p }); save({ platform: p }); }}
                  >
                    <option value="">—</option>
                    {TASK_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </Section>

            {/* Links */}
            <Section title="Links" collapsed={collapsed.links} onToggle={() => toggle("links")}>
              <div className="tp-grid2">
                <div className="tp-field tp-field--full">
                  <label className="tp-label" htmlFor="tp-url">URL</label>
                  <input
                    id="tp-url"
                    className="tp-input"
                    value={draft.url ?? ""}
                    placeholder="https://…"
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    onBlur={() => (draft.url ?? "") !== (task.url ?? "") && save({ url: draft.url || null })}
                  />
                </div>
                <div className="tp-field tp-field--full">
                  <label className="tp-label" htmlFor="tp-durl">Design URL</label>
                  <input
                    id="tp-durl"
                    className="tp-input"
                    value={draft.design_url ?? ""}
                    placeholder="Figma / comps / brand kit"
                    onChange={(e) => setDraft({ ...draft, design_url: e.target.value })}
                    onBlur={() => (draft.design_url ?? "") !== (task.design_url ?? "") && save({ design_url: draft.design_url || null })}
                  />
                </div>
              </div>
            </Section>

            {/* Blockers & Tags */}
            <Section title="Blockers & Tags" collapsed={collapsed.blockers} onToggle={() => toggle("blockers")}>
              <div className="tp-grid2">
                <div className="tp-field tp-field--full">
                  <label className="tp-label" htmlFor="tp-prereq">Manual prerequisites</label>
                  <textarea
                    id="tp-prereq"
                    className="tp-textarea"
                    value={draft.manual_prereqs ?? ""}
                    placeholder="Human-only blockers — access, approvals, vendor calls…"
                    onChange={(e) => setDraft({ ...draft, manual_prereqs: e.target.value })}
                    onBlur={() => (draft.manual_prereqs ?? "") !== (task.manual_prereqs ?? "") && save({ manual_prereqs: draft.manual_prereqs })}
                  />
                </div>
                <div className="tp-field tp-field--full">
                  <label className="tp-label" htmlFor="tp-blocked">Blocked by — task IDs</label>
                  <input
                    id="tp-blocked"
                    className="tp-input"
                    value={(draft.blocked_by ?? []).join(", ")}
                    placeholder="Comma-separated task UUIDs"
                    onChange={(e) => setDraft({ ...draft, blocked_by: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    onBlur={() => save({ blocked_by: draft.blocked_by ?? [] })}
                  />
                </div>
                <div className="tp-field tp-field--full">
                  <span className="tp-label">Tags</span>
                  <div className="tp-tags">
                    {tags.map((t) => (
                      <span key={t} className="tp-tag">
                        {t}
                        <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>×</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          if (tagDraft.trim()) { addTagValue(tagDraft); setTagDraft(""); }
                        } else if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
                          removeTag(tags[tags.length - 1]);
                        }
                      }}
                      onBlur={() => { if (tagDraft.trim()) { addTagValue(tagDraft); setTagDraft(""); } }}
                      placeholder={tags.length === 0 ? "Type and press Enter…" : "Add tag…"}
                      className="tp-input"
                      style={{ flex: 1, minWidth: 140, padding: "6px 10px", fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Acceptance Criteria */}
            <Section
              title="Acceptance Criteria"
              count={acItems.length}
              collapsed={collapsed.ac}
              onToggle={() => toggle("ac")}
            >
              <AcceptanceCriteriaChecklist
                items={acItems}
                onChange={(items) => { setDraft({ ...draft, acceptance_criteria: items }); save({ acceptance_criteria: items }); }}
              />
            </Section>

            {/* Attachments */}
            <Section
              title="Attachments"
              count={attachments.length}
              collapsed={collapsed.attachments}
              onToggle={() => toggle("attachments")}
              right={
                <label className="tp-addlink" onClick={(e) => e.stopPropagation()}>
                  <span className="plus">＋</span>Upload
                  <input
                    type="file"
                    hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAttachment(f); e.target.value = ""; }}
                  />
                </label>
              }
            >
              <div className="tp-rows">
                {attachments.map((a) => {
                  const ext = (a.file_name.split(".").pop() ?? "").slice(0, 3).toUpperCase();
                  const kb = a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : "";
                  return (
                    <div key={a.id} className="tp-att">
                      <div className="tp-att-ic">{ext || "·"}</div>
                      <div className="tp-att-info">
                        <a className="tp-att-name" href={a.signed_url} target="_blank" rel="noreferrer">{a.file_name}</a>
                        {kb && <div className="tp-att-meta">{kb}</div>}
                      </div>
                      <button
                        className="tp-row-del"
                        style={{ opacity: 1 }}
                        onClick={async () => { await tasksApi.deleteAttachment(a.id); await onChanged(); }}
                        aria-label="Delete attachment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                {attachments.length === 0 && (
                  <label className="tp-empty tp-empty--drop" style={{ display: "block" }}>
                    Drop files here, or click to browse
                    <input
                      type="file"
                      hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAttachment(f); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
            </Section>

            {/* Subtasks */}
            {!task.parent_task_id && (
              <Section
                title="Subtasks"
                count={subtasks.length}
                collapsed={collapsed.subtasks}
                onToggle={() => toggle("subtasks")}
                right={
                  <button
                    type="button"
                    className="tp-addlink"
                    onClick={(e) => { e.stopPropagation(); void addSubtask(); }}
                  >
                    <span className="plus">＋</span>Add subtask
                  </button>
                }
              >
                <div className="tp-rows">
                  {subtasks.map((st) => {
                    const isDone = st.status === "complete";
                    return (
                      <div key={st.id} className={`tp-row ${isDone ? "is-done" : ""}`}>
                        <button
                          type="button"
                          className="tp-row-box"
                          aria-label={isDone ? "Mark not done" : "Mark done"}
                          onClick={async () => {
                            await tasksApi.update(st.id, { status: isDone ? "backlog" : "complete" });
                            await onChanged();
                          }}
                        />
                        <button
                          type="button"
                          className="tp-row-label"
                          onClick={() => onOpenTask(st.id)}
                          style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit", flex: 1 }}
                        >
                          {st.name}
                        </button>
                        <span className="tp-row-meta">{TASK_STATUS_LABEL[st.status]}</span>
                        <button
                          className="tp-row-del"
                          onClick={async () => { if (confirm("Delete subtask?")) { await tasksApi.remove(st.id); await onChanged(); } }}
                          aria-label="Delete subtask"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {subtasks.length === 0 && <div className="tp-empty">No subtasks yet.</div>}
                </div>
              </Section>
            )}

            {/* Comments */}
            <CommentsSection taskId={task.id} collapsed={collapsed.comments} onToggle={() => toggle("comments")} />

            {/* Activity */}

            <Section title="Activity" collapsed={collapsed.activity} onToggle={() => toggle("activity")}>
              {activity.length === 0 ? (
                <div className="tp-empty">No activity yet.</div>
              ) : (
                <div className="tp-act">
                  {activity.map((a, i) => (
                    <div key={a.id} className="tp-act-item">
                      <div className="tp-act-rail">
                        <span className="tp-act-dot" style={i === 0 ? undefined : { background: "var(--tp-taupe)" }} />
                        <span className="tp-act-line" />
                      </div>
                      <div className="tp-act-body">
                        <div className="tp-act-txt">{a.message}</div>
                        <div className="tp-act-time">
                          {new Date(a.occurred_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {saving && <div className="tp-label" style={{ color: "var(--tp-accent)" }}>Saving…</div>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title, count, right, collapsed, onToggle, children,
}: {
  title: string; count?: number; right?: React.ReactNode;
  collapsed?: boolean; onToggle?: () => void; children: React.ReactNode;
}) {
  return (
    <section className={`tp-sec ${collapsed ? "is-collapsed" : ""}`}>
      <div className="tp-sec-head" onClick={onToggle}>
        <div className="tp-sec-label">
          {title}
          {count != null && <span className="tp-sec-count">{count}</span>}
        </div>
        <div className="tp-sec-right">
          {right}
          <span className="tp-sec-chev"><ChevronDown size={14} /></span>
        </div>
      </div>
      <div className="tp-sec-body">{children}</div>
    </section>
  );
}

/* ---------------- Comments section ---------------- */

function CommentsSection({
  taskId, collapsed, onToggle,
}: { taskId: string; collapsed?: boolean; onToggle: () => void }) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { comments } = await tasksApi.listComments(taskId);
      setComments(comments);
    } catch (e) {
      console.error("[comments] load", e);
    } finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const { comment } = await tasksApi.addComment(taskId, body);
      setComments((c) => [...c, comment]);
      setDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to post comment");
    } finally { setPosting(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    try {
      await tasksApi.deleteComment(id);
      setComments((c) => c.filter((x) => x.id !== id));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  // @mention popup logic
  const onDraftChange = (val: string) => {
    setDraft(val);
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const m = before.match(/@([a-zA-Z0-9_\-]*)$/);
    if (m) {
      setMentionQuery(m[1].toLowerCase());
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (handle: string) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const after = draft.slice(caret);
    const replaced = before.replace(/@([a-zA-Z0-9_\-]*)$/, `@${handle} `);
    const next = replaced + after;
    setDraft(next);
    setMentionOpen(false);
    setTimeout(() => {
      ta?.focus();
      const pos = replaced.length;
      ta?.setSelectionRange(pos, pos);
    }, 0);
  };

  const filteredHandles = MENTIONABLE_HANDLES.filter(
    (h) => h.handle.includes(mentionQuery) || h.label.toLowerCase().includes(mentionQuery),
  );

  const renderBody = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_\-]+)/g);
    return parts.map((p, i) =>
      p.startsWith("@") ? (
        <span key={i} className="tp-mention">{p}</span>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      ),
    );
  };

  return (
    <Section title="Comments" count={comments.length} collapsed={collapsed} onToggle={onToggle}>
      <div className="tp-comments">
        {loading && comments.length === 0 ? (
          <div className="tp-empty">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="tp-empty">No comments yet.</div>
        ) : (
          <div className="tp-comm-list">
            {comments.map((c) => (
              <div key={c.id} className="tp-comm">
                <div className="tp-comm-head">
                  <span className="tp-comm-author">{c.author_name}</span>
                  <span className="tp-comm-time">
                    {new Date(c.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                  {c.mentions.length > 0 && (
                    <span className="tp-comm-tags">
                      {c.mentions.map((m) => (
                        <span key={m} className="tp-mention-chip">@{m}</span>
                      ))}
                    </span>
                  )}
                  <button
                    type="button"
                    className="tp-row-del"
                    style={{ marginLeft: "auto", opacity: 1 }}
                    onClick={() => remove(c.id)}
                    aria-label="Delete comment"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="tp-comm-body">{renderBody(c.body)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tp-comm-form">
          <div className="tp-comm-form-wrap">
            <textarea
              ref={taRef}
              className="tp-comm-input"
              placeholder="Add a comment… type @ to mention (e.g. @claude-code)"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMentionOpen(false);
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(); }
              }}
              rows={3}
            />
            {mentionOpen && filteredHandles.length > 0 && (
              <div className="tp-mention-pop">
                {filteredHandles.map((h) => (
                  <button
                    key={h.handle}
                    type="button"
                    className="tp-mention-opt"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(h.handle); }}
                  >
                    <span className="tp-mention-opt-h">@{h.handle}</span>
                    <span className="tp-mention-opt-l">{h.label}</span>
                    {h.hint && <span className="tp-mention-opt-x">{h.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="tp-comm-actions">
            <span className="tp-comm-hint">⌘/Ctrl + Enter to post</span>
            <button
              type="button"
              className="tp-btn"
              disabled={posting || !draft.trim()}
              onClick={() => void submit()}
            >
              {posting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}



/* ---------------- Acceptance criteria checklist ---------------- */

function AcceptanceCriteriaChecklist({ items, onChange }: {
  items: AcceptanceCriterion[]; onChange: (items: AcceptanceCriterion[]) => void;
}) {
  const [draftText, setDraftText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const newId = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);



  const addItem = () => {
    const text = draftText.trim();
    if (!text) return;
    onChange([...items, { id: newId(), text, done: false }]);
    setDraftText("");
  };
  const toggle = (id: string) =>
    onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  const commitEdit = () => {
    if (!editingId) return;
    const t = editText.trim();
    if (!t) { setEditingId(null); return; }
    onChange(items.map((i) => (i.id === editingId ? { ...i, text: t } : i)));
    setEditingId(null);
  };

  return (
    <div>
      <div style={subLabel}>Acceptance criteria</div>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 && (
          <div className="text-xs !text-warm-white/60">No criteria yet — add the first thing that must be true to mark this done.</div>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 px-2 py-1.5 rounded border border-warm-white/10 bg-warm-white/[0.03]">
            <Checkbox
              checked={item.done}
              onCheckedChange={() => toggle(item.id)}
              className="mt-0.5 border-warm-white/40"
            />
            {editingId === item.id ? (
              <Input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") setEditingId(null); }}
                className={`${taskInputClass} h-7 text-sm flex-1`}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setEditingId(item.id); setEditText(item.text); }}
                className={`flex-1 text-left text-sm !text-warm-white hover:!text-warm-white/80 ${item.done ? "line-through opacity-60" : ""}`}
              >
                {item.text}
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="!text-warm-white/60 hover:!text-destructive shrink-0 mt-0.5"
              title="Delete criterion"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Input
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="Add a criterion and press Enter"
          className={`${taskInputClass} h-8 text-sm`}
        />
        <Button type="button" size="sm" onClick={addItem} className="bg-transparent border border-warm-white/20 !text-warm-white hover:bg-warm-white/10 h-8">
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}


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
                {ASSIGNEE_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>{ASSIGNEE_LABEL[k]}</SelectItem>
                ))}
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
