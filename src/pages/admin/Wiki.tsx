import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useWikiRole } from "@/hooks/useWikiRole";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  WIKI_DEPARTMENTS, WIKI_DOC_TYPES, WIKI_STATUSES, WIKI_ACCESS,
  WikiDocument, slugify, isStale, fmtDate,
} from "@/lib/wiki";
import WikiEditor from "@/components/admin/wiki/WikiEditor";
import { toast } from "sonner";
import { Search, Plus, ArrowLeft, Edit3, History, CheckCircle2, Download, Users, Trash2, RotateCcw } from "lucide-react";

const INK = "hsl(36 5% 16%)";
const CHARCOAL = "hsl(36 5% 12%)";
const CREAM = "hsl(40 20% 97%)";
const TAUPE = "hsl(40 10% 70%)";
const STONE = "hsl(40 8% 50%)";
const BORDER = "hsl(40 20% 97% / 0.10)";
const ACCENT = "hsl(28 30% 45%)";

const pageScroll: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", width: "100%" };
const page: React.CSSProperties = { padding: "56px 52px 120px", maxWidth: 1280, margin: "0 auto", color: CREAM };
const eyebrow: React.CSSProperties = { fontSize: 12, letterSpacing: "0.35em", textTransform: "uppercase", color: TAUPE, marginBottom: 16 };
const title: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 56, lineHeight: 1.05, margin: 0, letterSpacing: "-0.01em" };
const titleEm: React.CSSProperties = { fontStyle: "italic", color: ACCENT };
const rule: React.CSSProperties = { width: 48, height: 1, background: ACCENT, border: 0, margin: "20px 0 24px" };
const sub: React.CSSProperties = { color: TAUPE, fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: 620 };
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", color: STONE, marginBottom: 14 };

const btn: React.CSSProperties = {
  background: "transparent", border: `1px solid ${BORDER}`, color: CREAM,
  padding: "10px 18px", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
  cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8,
};
const btnPrimary: React.CSSProperties = { ...btn, background: CREAM, color: INK, borderColor: CREAM };
const btnAccent: React.CSSProperties = { ...btn, background: ACCENT, color: CREAM, borderColor: ACCENT };

const input: React.CSSProperties = {
  width: "100%", background: "transparent", border: `1px solid ${BORDER}`,
  color: CREAM, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", outline: "none",
};
const select: React.CSSProperties = { ...input, appearance: "none", cursor: "pointer" };

function Badge({ children, tone = STONE }: { children: React.ReactNode; tone?: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", fontSize: 10, letterSpacing: "0.18em",
      textTransform: "uppercase", color: tone, border: `1px solid ${tone}40`, background: `${tone}10`,
    }}>{children}</span>
  );
}

const statusTone = (s: string) => s === "Active" ? "hsl(150 35% 65%)" : s === "Draft" ? "hsl(40 60% 65%)" : STONE;

// ===== LIST =====
export function WikiList() {
  const { isFounder, hasAccess, loading } = useWikiRole();
  const nav = useNavigate();
  const [docs, setDocs] = useState<WikiDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (loading) return;
    (async () => {
      const { data, error } = await supabase
        .from("wiki_documents").select("*").order("updated_at", { ascending: false });
      if (error) toast.error(error.message);
      else setDocs((data as WikiDocument[]) || []);
      setLoaded(true);
    })();
  }, [loading]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return docs.filter(d => {
      if (dept && d.department !== dept) return false;
      if (type && d.doc_type !== type) return false;
      if (status && d.status !== status) return false;
      if (ql) {
        const hay = `${d.title} ${d.content} ${d.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [docs, q, dept, type, status]);

  if (loading) return <AdminLayout><div style={pageScroll}><div style={page}>Loading…</div></div></AdminLayout>;
  if (!hasAccess) return <AdminLayout><div style={pageScroll}><div style={page}>
    <p style={eyebrow}>Knowledge Base</p>
    <h1 style={title}>No <em style={titleEm}>access</em></h1>
    <hr style={rule} />
    <p style={sub}>You don't have access to the Knowledge Base. Ask the founder to add you.</p>
  </div></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={pageScroll}><div style={page}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24 }}>
          <div>
            <p style={eyebrow}>Knowledge Base</p>
            <h1 style={title}>Internal <em style={titleEm}>wiki</em></h1>
            <hr style={rule} />
            <p style={sub}>SOPs, vendor notes, client resources — everything operational, in one searchable place.</p>
          </div>
          {isFounder && (
            <div style={{ display: "flex", gap: 10 }}>
              <Link to="/admin/wiki/admin/users" style={{ ...btn, textDecoration: "none" }}><Users size={14} /> Users</Link>
              <Link to="/admin/wiki/admin/export" style={{ ...btn, textDecoration: "none" }}><Download size={14} /> Export</Link>
              <Link to="/admin/wiki/new" style={{ ...btnAccent, textDecoration: "none" }}><Plus size={14} /> New document</Link>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "44px 0 28px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 13, color: TAUPE }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, content, tags…"
              style={{ ...input, paddingLeft: 36 }} />
          </div>
          <select value={dept} onChange={e => setDept(e.target.value)} style={{ ...select, maxWidth: 220 }}>
            <option value="">All departments</option>
            {WIKI_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={type} onChange={e => setType(e.target.value)} style={{ ...select, maxWidth: 180 }}>
            <option value="">All types</option>
            {WIKI_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...select, maxWidth: 160 }}>
            <option value="">All statuses</option>
            {WIKI_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ border: `1px solid ${BORDER}`, background: CHARCOAL }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 180px 140px 110px 140px",
            gap: 16, padding: "14px 24px", borderBottom: `1px solid ${BORDER}`,
            fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: STONE,
          }}>
            <div>Title</div><div>Department</div><div>Type</div><div>Status</div><div>Updated</div>
          </div>
          {!loaded ? <div style={{ padding: 32, color: TAUPE }}>Loading…</div> :
           filtered.length === 0 ? <div style={{ padding: 48, textAlign: "center", color: TAUPE, fontStyle: "italic" }}>No documents yet.</div> :
           filtered.map(d => (
            <div key={d.id} onClick={() => nav(`/admin/wiki/${d.slug}`)} style={{
              display: "grid", gridTemplateColumns: "1fr 180px 140px 110px 140px",
              gap: 16, padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer",
              alignItems: "center", transition: "background 0.2s",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "hsl(36 5% 18%)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: CREAM, display: "flex", alignItems: "center", gap: 10 }}>
                  {d.title}
                  {isStale(d.last_reviewed_at) && <span title="Not reviewed in 6+ months" style={{ color: "hsl(8 55% 70%)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>· stale</span>}
                  {d.access_level === "Founder Only" && <span title="Founder Only" style={{ color: ACCENT, fontSize: 10 }}>● founder</span>}
                </div>
                {d.tags.length > 0 && <div style={{ fontSize: 12, color: TAUPE, marginTop: 4 }}>{d.tags.map(t => `#${t}`).join(" ")}</div>}
              </div>
              <div style={{ fontSize: 12, color: TAUPE, letterSpacing: "0.05em" }}>{d.department}</div>
              <div><Badge>{d.doc_type}</Badge></div>
              <div><Badge tone={statusTone(d.status)}>{d.status}</Badge></div>
              <div style={{ fontSize: 12, color: TAUPE }}>{fmtDate(d.updated_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div></AdminLayout>
  );
}

// SOP sections — each rendered as its own editor
const SOP_SECTIONS: { key: string; heading: string; placeholder: string }[] = [
  { key: "purpose", heading: "1. Purpose", placeholder: "One or two sentences. Why does this SOP exist? What outcome does it produce? If you can't explain why this SOP matters in two sentences, the SOP isn't ready to be written yet." },
  { key: "when", heading: "2. When to Run This SOP", placeholder: "The trigger. Be specific: a calendar date, a recurring cadence, a threshold being crossed, or an event happening. Avoid vague triggers like \"as needed.\"" },
  { key: "inputs", heading: "3. Inputs Required", placeholder: "What you need on hand before you start. Data, access, prior documents, information from other people. List as bullets." },
  { key: "tools", heading: "4. Tools / Systems Used", placeholder: "Every app, file, or platform touched during execution. Include links where helpful." },
  { key: "steps", heading: "5. Step-by-Step Process", placeholder: "Numbered steps. Each step is one discrete action. Be specific enough that someone unfamiliar with the task could follow it. If a step requires judgment, say what the judgment criteria are." },
  { key: "outputs", heading: "6. Outputs / Deliverables", placeholder: "What exists at the end that didn't exist at the beginning. A file, an updated dashboard, a sent email, a published post, a decision logged somewhere." },
  { key: "done", heading: "7. Definition of Done", placeholder: "Checklist that confirms the SOP was actually completed correctly. This is what someone reviewing the work would check." },
  { key: "pitfalls", heading: "8. Common Pitfalls", placeholder: "Mistakes that have been made before, or that are easy to make. Save future-you and future-interns the pain." },
];

function emptySopSections(): Record<string, string> {
  return SOP_SECTIONS.reduce((a, s) => ({ ...a, [s.key]: "" }), {} as Record<string, string>);
}

function serializeSopSections(sections: Record<string, string>): string {
  return SOP_SECTIONS
    .map(s => `<h2>${s.heading}</h2>\n${(sections[s.key] || "").trim() || "<p></p>"}`)
    .join("\n");
}

function parseSopSections(html: string): Record<string, string> {
  const out = emptySopSections();
  if (!html) return out;
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const headingText = m[1].replace(/<[^>]+>/g, "").trim();
    const body = m[2].trim();
    const num = headingText.match(/^(\d+)/)?.[1];
    const sec = SOP_SECTIONS.find(s => num && s.heading.startsWith(`${num}.`));
    if (sec) out[sec.key] = body;
  }
  return out;
}


// ===== EDITOR (new + edit) =====
export function WikiEdit({ mode }: { mode: "new" | "edit" }) {
  const { slug } = useParams();
  const nav = useNavigate();
  const { isFounder, loading } = useWikiRole();
  const { user } = useAdminAuth();
  const [doc, setDoc] = useState<Partial<WikiDocument>>({
    title: "", department: "Other", doc_type: "SOP", content: "",
    owner: "", status: "Draft", access_level: "All Staff", tags: [],
  });
  const [sopSections, setSopSections] = useState<Record<string, string>>(emptySopSections());
  const [origDoc, setOrigDoc] = useState<WikiDocument | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(mode === "edit");

  const isSop = doc.doc_type === "SOP";

  useEffect(() => {
    if (mode !== "edit" || !slug) return;
    (async () => {
      const { data, error } = await supabase.from("wiki_documents").select("*").eq("slug", slug).maybeSingle();
      if (error || !data) { toast.error("Not found"); nav("/admin/wiki"); return; }
      const d = data as WikiDocument;
      setDoc(d);
      setOrigDoc(d);
      setTagsText((d.tags || []).join(", "));
      if (d.doc_type === "SOP") setSopSections(parseSopSections(d.content || ""));
      setLoadingDoc(false);
    })();
  }, [mode, slug, nav]);

  if (loading || loadingDoc) return <AdminLayout><div style={pageScroll}><div style={page}>Loading…</div></div></AdminLayout>;
  if (!isFounder) return <AdminLayout><div style={pageScroll}><div style={page}>Founder only.</div></div></AdminLayout>;

  const save = async () => {
    if (!doc.title?.trim()) { toast.error("Title is required"); return; }
    const finalContent = isSop ? serializeSopSections(sopSections) : (doc.content || "");
    const stripped = finalContent.replace(/<[^>]+>/g, "").trim();
    if (!stripped) { toast.error("Content is required"); return; }
    setSaving(true);
    const tags = tagsText.split(",").map(t => t.trim()).filter(Boolean);
    const payload = {
      title: doc.title!.trim(),
      department: doc.department!,
      doc_type: doc.doc_type!,
      content: finalContent,
      owner: doc.owner || null,
      status: doc.status!,
      access_level: doc.access_level!,
      tags,
    };

    if (mode === "new") {
      let baseSlug = slugify(payload.title);
      let finalSlug = baseSlug;
      // ensure uniqueness
      for (let i = 2; i < 50; i++) {
        const { data: exists } = await supabase.from("wiki_documents").select("id").eq("slug", finalSlug).maybeSingle();
        if (!exists) break;
        finalSlug = `${baseSlug}-${i}`;
      }
      const { data, error } = await supabase.from("wiki_documents")
        .insert({ ...payload, slug: finalSlug, created_by: user?.id ?? null, last_reviewed_at: new Date().toISOString() })
        .select().single();
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      await supabase.from("wiki_revisions").insert({
        document_id: data.id, title: payload.title, content: payload.content,
        change_note: changeNote || "Initial version", edited_by: user?.id ?? null,
        edited_by_name: user?.email ?? null,
      });
      toast.success("Created");
      nav(`/admin/wiki/${finalSlug}`);
    } else if (origDoc) {
      const { error } = await supabase.from("wiki_documents").update(payload).eq("id", origDoc.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      await supabase.from("wiki_revisions").insert({
        document_id: origDoc.id, title: payload.title, content: payload.content,
        change_note: changeNote || null, edited_by: user?.id ?? null,
        edited_by_name: user?.email ?? null,
      });
      toast.success("Saved");
      nav(`/admin/wiki/${origDoc.slug}`);
    }
  };

  return (
    <AdminLayout>
      <div style={pageScroll}><div style={page}>
        <Link to={mode === "edit" && origDoc ? `/admin/wiki/${origDoc.slug}` : "/admin/wiki"} style={{ ...btn, textDecoration: "none", marginBottom: 24 }}>
          <ArrowLeft size={14} /> Back
        </Link>
        <p style={eyebrow}>{mode === "new" ? "New Document" : "Editing"}</p>

        <input
          value={doc.title || ""} onChange={e => setDoc({ ...doc, title: e.target.value })}
          placeholder="Document title"
          style={{ ...input, fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, padding: "12px 0", border: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 32 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 24 }}>
          <div>
            <div style={sectionLabel}>Department</div>
            <select value={doc.department} onChange={e => setDoc({ ...doc, department: e.target.value as any })} style={select}>
              {WIKI_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div style={sectionLabel}>Type</div>
            <select value={doc.doc_type} onChange={e => onTypeChange(e.target.value)} style={select}>
              {WIKI_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={sectionLabel}>Owner</div>
            <input value={doc.owner || ""} onChange={e => setDoc({ ...doc, owner: e.target.value })} style={input} placeholder="Person responsible" />
          </div>
          <div>
            <div style={sectionLabel}>Status</div>
            <select value={doc.status} onChange={e => setDoc({ ...doc, status: e.target.value as any })} style={select}>
              {WIKI_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={sectionLabel}>Access</div>
            <select value={doc.access_level} onChange={e => setDoc({ ...doc, access_level: e.target.value as any })} style={select}>
              {WIKI_ACCESS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div style={sectionLabel}>Tags (comma separated)</div>
            <input value={tagsText} onChange={e => setTagsText(e.target.value)} style={input} placeholder="onboarding, vendors" />
          </div>
        </div>

        <div style={sectionLabel}>Content</div>
        <WikiEditor value={doc.content || ""} onChange={c => setDoc({ ...doc, content: c })} />

        <div style={{ marginTop: 24 }}>
          <div style={sectionLabel}>Change note (optional)</div>
          <input value={changeNote} onChange={e => setChangeNote(e.target.value)} style={input} placeholder="What changed?" />
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
          <Link to={mode === "edit" && origDoc ? `/admin/wiki/${origDoc.slug}` : "/admin/wiki"} style={{ ...btn, textDecoration: "none" }}>Cancel</Link>
        </div>
      </div>
    </div></AdminLayout>
  );
}

// ===== DETAIL =====
export function WikiDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { isFounder, hasAccess, loading } = useWikiRole();
  const [doc, setDoc] = useState<WikiDocument | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);

  const load = async () => {
    if (!slug) return;
    const { data } = await supabase.from("wiki_documents").select("*").eq("slug", slug).maybeSingle();
    setDoc((data as WikiDocument) || null);
    setLoadingDoc(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug]);

  if (loading || loadingDoc) return <AdminLayout><div style={pageScroll}><div style={page}>Loading…</div></div></AdminLayout>;
  if (!hasAccess) return <AdminLayout><div style={pageScroll}><div style={page}>No access.</div></div></AdminLayout>;
  if (!doc) return <AdminLayout><div style={pageScroll}><div style={page}>Not found.</div></div></AdminLayout>;

  const markReviewed = async () => {
    const { error } = await supabase.from("wiki_documents").update({ last_reviewed_at: new Date().toISOString() }).eq("id", doc.id);
    if (error) toast.error(error.message);
    else { toast.success("Marked as reviewed"); load(); }
  };

  const del = async () => {
    if (!confirm("Delete this document and all its revisions?")) return;
    const { error } = await supabase.from("wiki_documents").delete().eq("id", doc.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); nav("/admin/wiki"); }
  };

  return (
    <AdminLayout>
      <div style={pageScroll}><div style={page}>
        <Link to="/admin/wiki" style={{ ...btn, textDecoration: "none", marginBottom: 24 }}>
          <ArrowLeft size={14} /> Knowledge Base
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 48, marginTop: 16 }}>
          <div>
            <p style={eyebrow}>{doc.department} · {doc.doc_type}</p>
            <h1 style={title}>{doc.title}</h1>
            <hr style={rule} />
            <div style={{ marginTop: 32 }} className="wiki-prose-render">
              <div dangerouslySetInnerHTML={{ __html: doc.content }} />
            </div>
            <style>{`
              .wiki-prose-render h1, .wiki-prose-render h2, .wiki-prose-render h3 { font-family: 'Cormorant Garamond', serif; font-weight: 300; color: ${CREAM}; margin: 1.4em 0 0.5em; line-height: 1.2; }
              .wiki-prose-render h1 { font-size: 36px; }
              .wiki-prose-render h2 { font-size: 28px; }
              .wiki-prose-render h3 { font-size: 22px; }
              .wiki-prose-render { color: ${CREAM}; font-size: 16px; line-height: 1.8; }
              .wiki-prose-render p { margin: 0 0 1em; }
              .wiki-prose-render ul, .wiki-prose-render ol { padding-left: 1.5em; margin: 0 0 1em; }
              .wiki-prose-render a { color: ${ACCENT}; }
              .wiki-prose-render blockquote { border-left: 2px solid ${ACCENT}; padding-left: 16px; margin: 1em 0; color: ${TAUPE}; font-style: italic; }
              .wiki-prose-render code { background: hsl(40 20% 97% / 0.08); padding: 2px 6px; }
              .wiki-prose-render pre { background: hsl(40 20% 97% / 0.05); padding: 14px; overflow-x: auto; }
              .wiki-prose-render pre code { background: transparent; padding: 0; }
              .wiki-prose-render img { max-width: 100%; }
              .wiki-prose-render hr { border: 0; border-top: 1px solid ${BORDER}; margin: 2em 0; }
              .wiki-prose-render table { border-collapse: collapse; width: 100%; margin: 1em 0; }
              .wiki-prose-render th, .wiki-prose-render td { border: 1px solid ${BORDER}; padding: 8px 12px; text-align: left; }
            `}</style>
          </div>

          <aside style={{ background: CHARCOAL, border: `1px solid ${BORDER}`, padding: 24, alignSelf: "start" }}>
            <div style={sectionLabel}>Details</div>
            <dl style={{ margin: 0, fontSize: 13 }}>
              {[
                ["Department", doc.department],
                ["Type", doc.doc_type],
                ["Owner", doc.owner || "—"],
                ["Status", doc.status],
                ["Access", doc.access_level],
                ["Updated", fmtDate(doc.updated_at)],
                ["Reviewed", doc.last_reviewed_at ? fmtDate(doc.last_reviewed_at) : "Never"],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <dt style={{ color: STONE, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>{k}</dt>
                  <dd style={{ margin: 0, color: CREAM, textAlign: "right" }}>{v}</dd>
                </div>
              ))}
            </dl>
            {doc.tags.length > 0 && (
              <>
                <div style={{ ...sectionLabel, marginTop: 20 }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {doc.tags.map(t => <Badge key={t}>#{t}</Badge>)}
                </div>
              </>
            )}
            {isStale(doc.last_reviewed_at) && (
              <div style={{ marginTop: 20, padding: 12, border: `1px solid hsl(8 55% 70% / 0.4)`, color: "hsl(8 55% 80%)", fontSize: 12 }}>
                ⚠ This doc hasn't been reviewed in 6+ months.
              </div>
            )}

            {isFounder && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
                <Link to={`/admin/wiki/${doc.slug}/edit`} style={{ ...btnAccent, textDecoration: "none", justifyContent: "center" }}>
                  <Edit3 size={13} /> Edit
                </Link>
                <button onClick={markReviewed} style={btn}><CheckCircle2 size={13} /> Mark reviewed</button>
                <Link to={`/admin/wiki/${doc.slug}/history`} style={{ ...btn, textDecoration: "none", justifyContent: "center" }}>
                  <History size={13} /> History
                </Link>
                <button onClick={del} style={{ ...btn, color: "hsl(8 55% 70%)", borderColor: "hsl(8 55% 70% / 0.4)" }}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div></AdminLayout>
  );
}

// ===== HISTORY =====
export function WikiHistory() {
  const { slug } = useParams();
  const { isFounder, hasAccess, loading } = useWikiRole();
  const [doc, setDoc] = useState<WikiDocument | null>(null);
  const [revs, setRevs] = useState<any[]>([]);
  const [loadingRevs, setLoadingRevs] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: d } = await supabase.from("wiki_documents").select("*").eq("slug", slug).maybeSingle();
      if (!d) { setLoadingRevs(false); return; }
      setDoc(d as WikiDocument);
      const { data: r } = await supabase.from("wiki_revisions").select("*").eq("document_id", (d as any).id).order("edited_at", { ascending: false });
      setRevs(r || []);
      setLoadingRevs(false);
    })();
  }, [slug]);

  const restore = async (rev: any) => {
    if (!doc || !isFounder) return;
    if (!confirm("Restore this version? Current content will be saved as a new revision first.")) return;
    const { error } = await supabase.from("wiki_documents").update({
      title: rev.title, content: rev.content,
    }).eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("wiki_revisions").insert({
      document_id: doc.id, title: rev.title, content: rev.content,
      change_note: `Restored from ${fmtDate(rev.edited_at)}`,
    });
    toast.success("Restored");
    window.location.href = `/admin/wiki/${doc.slug}`;
  };

  if (loading || loadingRevs) return <AdminLayout><div style={pageScroll}><div style={page}>Loading…</div></div></AdminLayout>;
  if (!hasAccess) return <AdminLayout><div style={pageScroll}><div style={page}>No access.</div></div></AdminLayout>;
  if (!doc) return <AdminLayout><div style={pageScroll}><div style={page}>Not found.</div></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={pageScroll}><div style={page}>
        <Link to={`/admin/wiki/${doc.slug}`} style={{ ...btn, textDecoration: "none", marginBottom: 24 }}>
          <ArrowLeft size={14} /> {doc.title}
        </Link>
        <p style={eyebrow}>Revision history</p>
        <h1 style={title}>{doc.title}</h1>
        <hr style={rule} />

        <div style={{ marginTop: 32, border: `1px solid ${BORDER}`, background: CHARCOAL }}>
          {revs.length === 0 ? (
            <div style={{ padding: 32, color: TAUPE, fontStyle: "italic" }}>No revisions yet.</div>
          ) : revs.map(r => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "16px 24px", borderBottom: `1px solid ${BORDER}` }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: CREAM }}>{r.title}</div>
                <div style={{ fontSize: 12, color: TAUPE, marginTop: 4 }}>
                  {fmtDate(r.edited_at)} · {r.edited_by_name || "—"}{r.change_note ? ` · ${r.change_note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setViewing(r)} style={btn}>View</button>
                {isFounder && <button onClick={() => restore(r)} style={btn}><RotateCcw size={12} /> Restore</button>}
              </div>
            </div>
          ))}
        </div>

        {viewing && (
          <div onClick={() => setViewing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", padding: 40, overflowY: "auto" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: INK, border: `1px solid ${BORDER}`, padding: 40, maxWidth: 900, margin: "auto", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
                <div>
                  <p style={eyebrow}>Snapshot · {fmtDate(viewing.edited_at)}</p>
                  <h2 style={{ ...title, fontSize: 36 }}>{viewing.title}</h2>
                </div>
                <button onClick={() => setViewing(null)} style={btn}>Close</button>
              </div>
              <div className="wiki-prose-render" dangerouslySetInnerHTML={{ __html: viewing.content }} />
            </div>
          </div>
        )}
      </div>
    </div></AdminLayout>
  );
}

// ===== USER ADMIN =====
export function WikiUsers() {
  const { isFounder, loading } = useWikiRole();
  const [rows, setRows] = useState<any[]>([]);
  const [load2, setLoad2] = useState(true);
  const [form, setForm] = useState({ user_id: "", name: "", email: "", role: "intern" });

  const load = async () => {
    const { data } = await supabase.from("wiki_user_roles").select("*").order("created_at", { ascending: false });
    setRows(data || []); setLoad2(false);
  };
  useEffect(() => { if (!loading && isFounder) load(); }, [loading, isFounder]);

  if (loading) return <AdminLayout><div style={pageScroll}><div style={page}>Loading…</div></div></AdminLayout>;
  if (!isFounder) return <AdminLayout><div style={pageScroll}><div style={page}>Founder only.</div></div></AdminLayout>;

  const add = async () => {
    if (!form.user_id || !form.email || !form.name) { toast.error("All fields required"); return; }
    const { error } = await supabase.from("wiki_user_roles").insert({
      user_id: form.user_id, email: form.email, name: form.name, role: form.role as any, active: true,
    });
    if (error) toast.error(error.message);
    else { toast.success("Added"); setForm({ user_id: "", name: "", email: "", role: "intern" }); load(); }
  };

  const toggle = async (r: any) => {
    const { error } = await supabase.from("wiki_user_roles").update({ active: !r.active }).eq("id", r.id);
    if (error) toast.error(error.message); else load();
  };

  const remove = async (r: any) => {
    if (!confirm(`Remove ${r.name}?`)) return;
    const { error } = await supabase.from("wiki_user_roles").delete().eq("id", r.id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <AdminLayout>
      <div style={pageScroll}><div style={page}>
        <Link to="/admin/wiki" style={{ ...btn, textDecoration: "none", marginBottom: 24 }}>
          <ArrowLeft size={14} /> Knowledge Base
        </Link>
        <p style={eyebrow}>Wiki Users</p>
        <h1 style={title}>Manage <em style={titleEm}>access</em></h1>
        <hr style={rule} />
        <p style={sub}>The user must already have a login. Paste their auth user ID below to grant wiki access. Toggle active off when an intern's term ends.</p>

        <div style={{ marginTop: 32, padding: 24, border: `1px solid ${BORDER}`, background: CHARCOAL }}>
          <div style={sectionLabel}>Add user</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 140px 100px", gap: 12 }}>
            <input value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} placeholder="Auth user ID (uuid)" style={input} />
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" style={input} />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" style={input} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={select}>
              <option value="intern">Intern</option>
              <option value="contractor">Contractor</option>
              <option value="founder">Founder</option>
            </select>
            <button onClick={add} style={btnPrimary}>Add</button>
          </div>
        </div>

        <div style={{ marginTop: 24, border: `1px solid ${BORDER}`, background: CHARCOAL }}>
          {load2 ? <div style={{ padding: 24, color: TAUPE }}>Loading…</div> :
           rows.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: TAUPE, fontStyle: "italic" }}>No additional users.</div> :
           rows.map(r => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 90px 200px", gap: 16, padding: "16px 24px", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
              <div><div style={{ color: CREAM, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 11, color: STONE, letterSpacing: "0.05em" }}>{r.user_id}</div></div>
              <div style={{ color: TAUPE, fontSize: 13 }}>{r.email}</div>
              <Badge tone={r.role === "founder" ? ACCENT : STONE}>{r.role}</Badge>
              <Badge tone={r.active ? "hsl(150 35% 65%)" : "hsl(8 55% 70%)"}>{r.active ? "Active" : "Inactive"}</Badge>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => toggle(r)} style={btn}>{r.active ? "Deactivate" : "Activate"}</button>
                <button onClick={() => remove(r)} style={{ ...btn, color: "hsl(8 55% 70%)" }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div></AdminLayout>
  );
}

// ===== EXPORT =====
export function WikiExport() {
  const { isFounder, loading } = useWikiRole();
  const [busy, setBusy] = useState(false);

  if (loading) return <AdminLayout><div style={pageScroll}><div style={page}>Loading…</div></div></AdminLayout>;
  if (!isFounder) return <AdminLayout><div style={pageScroll}><div style={page}>Founder only.</div></div></AdminLayout>;

  const run = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.from("wiki_documents").select("*");
      if (error) throw error;
      const docs = (data as WikiDocument[]) || [];
      const [{ default: TurndownService }, { default: JSZip }] = await Promise.all([
        import("turndown"), import("jszip"),
      ]);
      const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
      const zip = new JSZip();
      for (const d of docs) {
        const folder = zip.folder(d.department) || zip;
        const md = td.turndown(d.content || "");
        const yaml = (s: string | null | undefined) => (s == null ? "" : String(s).replace(/"/g, '\\"'));
        const fm = [
          "---",
          `title: "${yaml(d.title)}"`,
          `slug: ${d.slug}`,
          `department: "${yaml(d.department)}"`,
          `doc_type: "${yaml(d.doc_type)}"`,
          `owner: "${yaml(d.owner)}"`,
          `status: ${d.status}`,
          `access_level: "${yaml(d.access_level)}"`,
          `tags: [${(d.tags || []).map(t => `"${yaml(t)}"`).join(", ")}]`,
          `updated_at: ${d.updated_at}`,
          d.last_reviewed_at ? `last_reviewed_at: ${d.last_reviewed_at}` : "",
          "---",
          "",
          `# ${d.title}`,
          "",
          md,
        ].filter(Boolean).join("\n");
        folder.file(`${d.slug}.md`, fm);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wiki-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${docs.length} documents`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout>
      <div style={pageScroll}><div style={page}>
        <Link to="/admin/wiki" style={{ ...btn, textDecoration: "none", marginBottom: 24 }}>
          <ArrowLeft size={14} /> Knowledge Base
        </Link>
        <p style={eyebrow}>Backup</p>
        <h1 style={title}>Export <em style={titleEm}>everything</em></h1>
        <hr style={rule} />
        <p style={sub}>Download a zip of all documents as Markdown files, organized by department, each with frontmatter. Run monthly and store in Google Drive.</p>
        <div style={{ marginTop: 32 }}>
          <button onClick={run} disabled={busy} style={btnPrimary}>
            <Download size={14} /> {busy ? "Building…" : "Generate export"}
          </button>
        </div>
      </div>
    </div></AdminLayout>
  );
}
