// Public endpoint: serves uploaded preview files keyed by slug.
// Injects the feedback widget into HTML responses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const FEEDBACK_WIDGET_JS = `(() => {
  const SLUG = window.__PREVIEW_SLUG__;
  const PAGE = window.__PREVIEW_PAGE__;
  const API = window.__PREVIEW_API__;
  const AUTHOR = window.__PREVIEW_AUTHOR__ || "";
  if (!SLUG || !API) return;

  // ---- Local edit-token store (per browser, per pin/reply) ----
  const TKEY = "pf-tokens-" + SLUG;
  function tokens(){ try { return JSON.parse(localStorage.getItem(TKEY) || "{}"); } catch(e){ return {}; } }
  function setToken(kind, id, tok){ const t = tokens(); t[kind+":"+id] = tok; localStorage.setItem(TKEY, JSON.stringify(t)); }
  function getToken(kind, id){ return tokens()[kind+":"+id]; }
  function removeToken(kind, id){ const t = tokens(); delete t[kind+":"+id]; localStorage.setItem(TKEY, JSON.stringify(t)); }

  const styles = \`
    #pf-toggle{position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#0F172A;color:#fff;font:600 14px/1 system-ui,sans-serif;padding:13px 18px;border-radius:999px;border:0;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.25);letter-spacing:.04em}
    #pf-toggle.on{background:#dc2626}
    .pf-pin{position:absolute;width:30px;height:30px;border-radius:50%;background:#dc2626;color:#fff;font:700 14px/30px system-ui;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);z-index:2147483645;transform:translate(-50%,-50%);border:2px solid #fff}
    .pf-pin.resolved{background:#16a34a}
    #pf-modal{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
    #pf-modal.show{display:flex}
    .pf-card{background:#fff;border-radius:12px;padding:22px;width:min(480px,90vw);max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)}
    .pf-card h3{margin:0 0 14px;font:600 18px system-ui;color:#0F172A}
    .pf-card label{display:block;font:500 13px system-ui;color:#475569;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.06em}
    .pf-card input,.pf-card textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:11px;font:15px system-ui;box-sizing:border-box;color:#0F172A;background:#fff}
    .pf-card textarea{min-height:90px;resize:vertical}
    .pf-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;flex-wrap:wrap}
    .pf-btn{border:0;border-radius:8px;padding:10px 16px;font:600 14px system-ui;cursor:pointer}
    .pf-btn.primary{background:#0F172A;color:#fff}
    .pf-btn.ghost{background:#e2e8f0;color:#0F172A}
    .pf-btn.danger{background:#fee2e2;color:#b91c1c}
    .pf-msg{padding:11px 13px;border-radius:8px;font:15px system-ui;margin-bottom:8px;background:#f1f5f9;color:#0F172A;position:relative}
    .pf-msg.admin{background:#0F172A;color:#fff}
    .pf-msg .pf-meta{font-size:13px;opacity:.7;margin-bottom:4px}
    .pf-msg .pf-mine-actions{margin-top:6px;display:flex;gap:6px}
    .pf-msg .pf-mine-actions button{background:transparent;border:0;font:500 13px system-ui;cursor:pointer;color:inherit;opacity:.7;text-decoration:underline;padding:0}
    body.pf-pick *{cursor:crosshair !important}
  \`;
  const style = document.createElement("style"); style.textContent = styles; document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.id = "pf-toggle"; toggle.textContent = "💬 Leave feedback";
  document.body.appendChild(toggle);

  const modal = document.createElement("div");
  modal.id = "pf-modal";
  modal.innerHTML = \`
    <div class="pf-card">
      <h3 id="pf-title">Leave feedback</h3>
      <div id="pf-form">
        <label id="pf-body-label">Comment</label>
        <textarea id="pf-body" placeholder="What would you like to change?"></textarea>
        <div class="pf-actions">
          <button class="pf-btn ghost" id="pf-cancel">Cancel</button>
          <button class="pf-btn primary" id="pf-save">Send</button>
        </div>
      </div>
      <div id="pf-view" style="display:none">
        <div id="pf-view-body" class="pf-msg" style="background:#f8fafc"></div>
        <div id="pf-replies" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
        <div id="pf-reply-box" style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:12px">
          <label>Reply</label>
          <textarea id="pf-reply-body" placeholder="Write a reply…"></textarea>
          <div class="pf-actions">
            <button class="pf-btn ghost" id="pf-close">Close</button>
            <button class="pf-btn primary" id="pf-reply-send">Reply</button>
          </div>
        </div>
      </div>
    </div>\`;
  document.body.appendChild(modal);

  let pickMode = false;
  let pendingSelector = null, pendingX = 0, pendingY = 0;
  let editingComment = null;
  let viewingPin = null;

  function uniqueSelector(el){
    if (!el || el === document.body) return "body";
    const path = [];
    while (el && el.nodeType === 1 && el !== document.body && path.length < 8){
      let part = el.nodeName.toLowerCase();
      if (el.id) { part += "#" + CSS.escape(el.id); path.unshift(part); break; }
      const parent = el.parentNode;
      if (parent){
        const sibs = Array.from(parent.children).filter(c=>c.nodeName===el.nodeName);
        if (sibs.length>1) part += ":nth-of-type("+(sibs.indexOf(el)+1)+")";
      }
      path.unshift(part);
      el = el.parentNode;
    }
    return "body > " + path.join(" > ");
  }

  function showForm(title){
    document.getElementById("pf-title").textContent = title;
    document.getElementById("pf-form").style.display = "block";
    document.getElementById("pf-view").style.display = "none";
    modal.classList.add("show");
  }
  function showView(){
    document.getElementById("pf-form").style.display = "none";
    document.getElementById("pf-view").style.display = "block";
    modal.classList.add("show");
  }

  toggle.onclick = () => {
    pickMode = !pickMode;
    toggle.classList.toggle("on", pickMode);
    toggle.textContent = pickMode ? "✕ Cancel feedback" : "💬 Leave feedback";
    document.body.classList.toggle("pf-pick", pickMode);
  };

  document.addEventListener("click", (ev) => {
    if (!pickMode) return;
    if (ev.target.closest("#pf-toggle, #pf-modal, .pf-pin")) return;
    ev.preventDefault(); ev.stopPropagation();
    const el = ev.target;
    const rect = el.getBoundingClientRect();
    pendingSelector = uniqueSelector(el);
    pendingX = ((ev.clientX - rect.left) / Math.max(rect.width,1)) * 100;
    pendingY = ((ev.clientY - rect.top) / Math.max(rect.height,1)) * 100;
    editingComment = null;
    document.getElementById("pf-body").value = "";
    showForm("Leave feedback");
    pickMode = false; toggle.classList.remove("on");
    toggle.textContent = "💬 Leave feedback";
    document.body.classList.remove("pf-pick");
  }, true);

  document.getElementById("pf-cancel").onclick = () => modal.classList.remove("show");
  document.getElementById("pf-close").onclick = () => modal.classList.remove("show");

  document.getElementById("pf-save").onclick = async () => {
    const body = document.getElementById("pf-body").value.trim();
    if (!body) return;
    if (editingComment) {
      const res = await fetch(API + "/preview-comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "comment", id: editingComment.id, body })
      });
      if (res.ok) { editingComment = null; modal.classList.remove("show"); await loadPins(); }
      else alert("Could not update comment");
      return;
    }
    const res = await fetch(API + "/preview-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: SLUG, page_path: PAGE, selector: pendingSelector, x_pct: pendingX, y_pct: pendingY, viewport_width: window.innerWidth, author_name: AUTHOR || "Client", body })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.comment && data.edit_token) setToken("comment", data.comment.id, data.edit_token);
      modal.classList.remove("show");
      await loadPins();
    } else { alert("Could not save comment"); }
  };

  document.getElementById("pf-reply-send").onclick = async () => {
    if (!viewingPin) return;
    const body = document.getElementById("pf-reply-body").value.trim();
    if (!body) return;
    const res = await fetch(API + "/preview-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reply", comment_id: viewingPin.id, body, author_name: AUTHOR || "Client" })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.reply && data.edit_token) setToken("reply", data.reply.id, data.edit_token);
      document.getElementById("pf-reply-body").value = "";
      await loadPins();
      const fresh = pins.find(p => p.id === viewingPin.id);
      if (fresh) openPin(fresh);
    } else { alert("Could not reply"); }
  };

  let pins = [];
  async function loadPins(){
    const res = await fetch(API + "/preview-comments?slug=" + encodeURIComponent(SLUG) + "&page_path=" + encodeURIComponent(PAGE));
    if (!res.ok) return;
    const data = await res.json();
    pins = data.comments || [];
    renderPins();
  }

  function renderPins(){
    document.querySelectorAll(".pf-pin").forEach(n=>n.remove());
    pins.forEach(p => {
      let target;
      try { target = document.querySelector(p.selector); } catch(e){}
      if (!target) target = document.body;
      const rect = target.getBoundingClientRect();
      const top = window.scrollY + rect.top + (rect.height * (p.y_pct/100));
      const left = window.scrollX + rect.left + (rect.width * (p.x_pct/100));
      const dot = document.createElement("div");
      dot.className = "pf-pin" + (p.status === "resolved" ? " resolved" : "");
      dot.style.top = top + "px"; dot.style.left = left + "px";
      dot.textContent = String(p.pin_number);
      dot.onclick = (e) => { e.stopPropagation(); openPin(p); };
      document.body.appendChild(dot);
    });
  }

  function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c])); }

  function openPin(p){
    viewingPin = p;
    document.getElementById("pf-title").textContent = "Pin #" + p.pin_number + (p.status==="resolved" ? " (resolved)" : "");
    const main = document.getElementById("pf-view-body");
    main.innerHTML = "<div class='pf-meta'>" + escapeHtml(p.author_name || "Guest") + " · " + new Date(p.created_at).toLocaleString() + "</div><div style='white-space:pre-wrap'>" + escapeHtml(p.body) + "</div>" +
      "<div class='pf-mine-actions'><button data-act='edit'>Edit</button><button data-act='delete'>Delete</button></div>";
    main.querySelectorAll("button[data-act]").forEach(b => {
      b.onclick = async () => {
        const act = b.getAttribute("data-act");
        if (act === "edit") {
          editingComment = p;
          document.getElementById("pf-body").value = p.body;
          showForm("Edit pin #" + p.pin_number);
        } else if (act === "delete") {
          if (!confirm("Delete this comment?")) return;
          const res = await fetch(API + "/preview-comments?kind=comment&id=" + p.id, { method: "DELETE" });
          if (res.ok) { removeToken("comment", p.id); modal.classList.remove("show"); await loadPins(); }
          else alert("Could not delete");
        }
      };
    });

    const r = document.getElementById("pf-replies"); r.innerHTML = "";
    (p.replies || []).forEach(rep => {
      const d = document.createElement("div");
      d.className = "pf-msg" + (rep.is_admin ? " admin" : "");
      const repId = "pf-rep-" + rep.id;
      d.innerHTML = "<div class='pf-meta'>" + escapeHtml(rep.author_name || (rep.is_admin?"Admin":"Guest")) + " · " + new Date(rep.created_at).toLocaleString() + "</div>" +
        "<div id='" + repId + "-body' style='white-space:pre-wrap'>" + escapeHtml(rep.body) + "</div>" +
        "<div class='pf-mine-actions'><button data-act='edit-reply'>Edit</button><button data-act='delete-reply'>Delete</button></div>";
      d.querySelector("button[data-act='edit-reply']").onclick = () => {
        const bodyDiv = d.querySelector("#" + repId + "-body");
        const current = rep.body;
        bodyDiv.innerHTML = "<textarea style='width:100%;min-height:70px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font:14px system-ui;box-sizing:border-box'>" + escapeHtml(current) + "</textarea><div style='display:flex;gap:6px;margin-top:6px'><button class='pf-btn ghost' data-cancel>Cancel</button><button class='pf-btn primary' data-save>Save</button></div>";
        const ta = bodyDiv.querySelector("textarea");
        bodyDiv.querySelector("[data-cancel]").onclick = () => openPin(p);
        bodyDiv.querySelector("[data-save]").onclick = async () => {
          const newBody = ta.value.trim();
          if (!newBody) return;
          const res = await fetch(API + "/preview-comments", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "reply", id: rep.id, body: newBody })
          });
          if (res.ok) { await loadPins(); const fresh = pins.find(x => x.id === p.id); if (fresh) openPin(fresh); }
          else alert("Could not update reply");
        };
      };
      d.querySelector("button[data-act='delete-reply']").onclick = async () => {
        if (!confirm("Delete this reply?")) return;
        const res = await fetch(API + "/preview-comments?kind=reply&id=" + rep.id, { method: "DELETE" });
        if (res.ok) { removeToken("reply", rep.id); await loadPins(); const fresh = pins.find(x => x.id === p.id); if (fresh) openPin(fresh); }
        else alert("Could not delete");
      };
      r.appendChild(d);
    });
    document.getElementById("pf-reply-body").value = "";
    showView();
  }

  window.addEventListener("resize", renderPins);
  window.addEventListener("scroll", renderPins, { passive: true });
  window.addEventListener("load", () => setTimeout(renderPins, 200));
  loadPins();
  setInterval(loadPins, 15000);
})();`;

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8", svg: "image/svg+xml",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp4: "video/mp4", webm: "video/webm", txt: "text/plain; charset=utf-8",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    let path = url.searchParams.get("path") || "";
    if (!slug) return new Response("missing slug", { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: project, error } = await admin
      .from("preview_projects")
      .select("id,slug,storage_prefix,entry_path,feedback_enabled,archived,client_project_id")
      .eq("slug", slug)
      .single();
    if (error || !project || project.archived) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (!path) path = project.entry_path;

    // Special path: serve the injected feedback widget
    if (path === "__pf_widget.js") {
      return new Response(FEEDBACK_WIDGET_JS, {
        headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }

    // Reject path traversal
    if (path.includes("..")) return new Response("bad path", { status: 400, headers: corsHeaders });

    let { data: file, error: dlErr } = await admin.storage
      .from("preview-sites")
      .download(`${project.storage_prefix}${path}`);
    let resolvedVia = "exact";
    if (dlErr || !file) {
      // Fallback: match by basename across all project files (case-insensitive)
      const want = path.split("/").pop()?.toLowerCase() ?? "";
      if (want) {
        const { data: rows } = await admin
          .from("preview_files").select("path").eq("project_id", project.id);
        const hit = (rows ?? []).find((r: any) => r.path.split("/").pop()?.toLowerCase() === want);
        if (hit) {
          const second = await admin.storage.from("preview-sites").download(`${project.storage_prefix}${hit.path}`);
          if (!second.error && second.data) {
            file = second.data;
            path = hit.path;
            dlErr = null as any;
            resolvedVia = "basename";
          }
        }
      }
      if (!file) return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const ct = contentTypeFor(path);
    const isHtml = ct.startsWith("text/html");

    if (isHtml) {
      let html = await file.text();
      const base = `${FN_BASE}/preview-serve?slug=${encodeURIComponent(slug)}&path=`;
      // Resolve a (possibly relative) asset reference against the current HTML path
      const resolveRef = (ref: string): string => {
        // Skip protocol-absolute, data, mailto, tel, anchor, js
        if (/^(https?:|\/\/|data:|mailto:|tel:|#|javascript:|blob:)/i.test(ref)) return ref;
        let target = ref.replace(/[?#].*$/, "");
        const tail = ref.slice(target.length);
        if (target.startsWith("/")) {
          target = target.replace(/^\/+/, "");
        } else {
          // Resolve relative to current page's directory
          const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
          target = dir + target;
          // Normalize ./ and ../ segments
          const parts: string[] = [];
          for (const seg of target.split("/")) {
            if (seg === "" || seg === ".") continue;
            if (seg === "..") parts.pop();
            else parts.push(seg);
          }
          target = parts.join("/");
        }
        return `${base}${encodeURIComponent(target)}${tail}`;
      };
      // Rewrite src/href on any tag
      html = html.replace(/(\s(?:src|href|poster|data-src))=("|')([^"']+)\2/gi,
        (_m, attr, q, p) => `${attr}=${q}${resolveRef(p)}${q}`);
      // Rewrite srcset (comma-separated list with optional descriptors)
      html = html.replace(/(\ssrcset)=("|')([^"']+)\2/gi, (_m, attr, q, list) => {
        const rewritten = list.split(",").map((part: string) => {
          const t = part.trim();
          if (!t) return "";
          const sp = t.indexOf(" ");
          const url = sp === -1 ? t : t.slice(0, sp);
          const desc = sp === -1 ? "" : t.slice(sp);
          return resolveRef(url) + desc;
        }).filter(Boolean).join(", ");
        return `${attr}=${q}${rewritten}${q}`;
      });
      // Rewrite url(...) in inline <style>/style attributes
      html = html.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi,
        (_m, q, p) => `url(${q}${resolveRef(p)}${q})`);

      // Inject feedback bootstrap before </body>
      const inject = project.feedback_enabled
        ? `<script>window.__PREVIEW_SLUG__=${JSON.stringify(slug)};window.__PREVIEW_PAGE__=${JSON.stringify(path)};window.__PREVIEW_API__=${JSON.stringify(FN_BASE)};</script><script src="${FN_BASE}/preview-serve?slug=${encodeURIComponent(slug)}&path=__pf_widget.js"></script>`
        : "";
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, inject + "</body>");
      else html += inject;

      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": ct,
          "Cache-Control": "no-store",
          "X-Frame-Options": "ALLOWALL",
        },
      });
    }

    // Special: serve the embedded feedback widget if requested
    return new Response(await file.arrayBuffer(), {
      headers: { ...corsHeaders, "Content-Type": ct, "Cache-Control": "public, max-age=300" },
    });
  } catch (e: any) {
    // Special widget path
    const url = new URL(req.url);
    if (url.searchParams.get("path") === "__pf_widget.js") {
      return new Response(FEEDBACK_WIDGET_JS, {
        headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8" },
      });
    }
    return new Response("error: " + (e?.message || e), { status: 500, headers: corsHeaders });
  }
});
