import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, LogOut } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const TITLE_MAP: Array<[RegExp, string]> = [
  [/^\/admin\/?$/, "Dashboard"],
  [/^\/admin\/clients\/?$/, "Clients"],
  [/^\/admin\/clients\/[^/]+\/projects\/[^/]+/, "Project"],
  [/^\/admin\/clients\/[^/]+\/?$/, "Client"],
  [/^\/admin\/tasks\/?$/, "Tasks"],
  [/^\/admin\/wiki\/admin\/users/, "Wiki Users"],
  [/^\/admin\/wiki\/admin\/export/, "Wiki Export"],
  [/^\/admin\/wiki\/new/, "New Article"],
  [/^\/admin\/wiki\/[^/]+\/history/, "History"],
  [/^\/admin\/wiki\/[^/]+\/edit/, "Edit"],
  [/^\/admin\/wiki\/[^/]+$/, "Article"],
  [/^\/admin\/wiki\/?$/, "Knowledge"],
  [/^\/admin\/invites/, "Invites"],
  [/^\/admin\/tokens/, "Settings"],
  [/^\/admin\/previews\/[^/]+/, "Preview"],
  [/^\/admin\/previews\/?$/, "Previews"],
  [/^\/admin\/profile/, "Profile"],
];

const TOP_LEVEL = new Set(["/admin", "/admin/clients", "/admin/tasks", "/admin/wiki", "/admin/profile"]);

export default function MobileTopBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { signOut } = useAdminAuth();

  const title = TITLE_MAP.find(([re]) => re.test(loc.pathname))?.[1] ?? "Cre8 CRM";
  const showBack = !TOP_LEVEL.has(loc.pathname);

  return (
    <header className="m-topbar">
      {showBack ? (
        <button className="m-topbar__btn" onClick={() => nav(-1)} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={1.5} />
        </button>
      ) : (
        <span className="m-topbar__btn" aria-hidden />
      )}
      <h1 className="m-topbar__title">{title}</h1>
      <button className="m-topbar__btn" onClick={signOut} aria-label="Sign out">
        <LogOut size={18} strokeWidth={1.5} />
      </button>
    </header>
  );
}
