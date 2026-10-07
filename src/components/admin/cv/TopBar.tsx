import { Bell, Plus, Search } from "lucide-react";
import { toast } from "sonner";

// Search, notifications and "New" are chrome only in Phase 1 (CRE-332) — the
// data to back them lands with the pages that need them (Today in Phase 2).
// A disabled search input would look broken; a toast is an honest "not yet".
function comingSoon() {
  toast("Coming in a later phase of the admin redesign.");
}

export default function TopBar() {
  return (
    <div className="cv-topbar">
      <button type="button" className="cv-topbar__search" onClick={comingSoon} style={{ cursor: "pointer", textAlign: "left" }}>
        <Search size={15} />
        <span style={{ flex: 1, color: "var(--cv-faint)" }}>Search clients, proposals, tasks...</span>
        <kbd>⌘K</kbd>
      </button>
      <button type="button" className="cv-topbar__icon-btn" onClick={comingSoon} aria-label="Notifications">
        <Bell size={16} strokeWidth={1.75} />
      </button>
      <button type="button" className="cv-topbar__new" onClick={comingSoon}>
        <Plus size={16} strokeWidth={2} />
        New
      </button>
    </div>
  );
}
