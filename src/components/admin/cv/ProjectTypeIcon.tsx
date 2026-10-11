import { Smartphone, Globe, Megaphone, Workflow, Eye, FolderKanban, type LucideIcon } from "lucide-react";
import { projectTypeStyle } from "@/lib/projectType";

// The tinted square in front of a project's name.
//
// The glyph lives here rather than in @/lib/projectType because that module
// is pure and tested, and an icon component is neither — but the tint it
// sits on comes from there, so the square and the pill beside it can never
// disagree about what colour an app project is.

const ICONS: Record<string, LucideIcon> = {
  app_development: Smartphone,
  web_development: Globe,
  marketing: Megaphone,
  automation_build: Workflow,
  site_preview: Eye,
};

export default function ProjectTypeIcon({
  type, size = 46, icon = 22,
}: { type: string | null | undefined; size?: number; icon?: number }) {
  const style = projectTypeStyle(type);
  // A type nobody has drawn an icon for gets the generic one rather than a
  // blank square — new types reach the database before they reach this file.
  const Icon = ICONS[(type ?? "").trim().toLowerCase()] ?? FolderKanban;
  return (
    <span
      className="cv-ic"
      style={{ background: style.bg, color: style.fg, width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={icon} />
    </span>
  );
}
