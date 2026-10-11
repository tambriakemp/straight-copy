// What a `client_projects.type` is called and what colour it carries.
//
// The label map existed in four places — AgentClientView, OverviewTab,
// AppDevelopmentView and Payments — each with its own spelling ("App"
// against "App Development") and its own idea of which types exist. A
// client page calling a project "App" beside a project page calling the
// same project "App Development" is two answers to one question.
//
// The colours are the canvas's: a dot on the clients list, a tinted icon
// chip on the client page, a pill on the project page, all the same hue
// per type so a project is recognisable before you read it.

export interface ProjectTypeStyle {
  /** What a person reads. Written out, not abbreviated. */
  label: string;
  /** The dot / pill fill. */
  bg: string;
  /** Text on that fill. */
  fg: string;
  /** The solid dot colour, for places that show no text. */
  dot: string;
}

const TYPES: Record<string, ProjectTypeStyle> = {
  app_development: { label: "App development", bg: "#F3E8FF", fg: "#6B2FB8", dot: "#8B5CF6" },
  web_development: { label: "Web development", bg: "#E7EEFF", fg: "#2447C0", dot: "#2F5BEA" },
  marketing: { label: "Marketing", bg: "#FFF1E3", fg: "#A8440A", dot: "#F2A65A" },
  automation_build: { label: "Automation", bg: "#E5F6EC", fg: "#17703D", dot: "#1E8E4E" },
  site_preview: { label: "Preview", bg: "#EEF0F5", fg: "#3D4556", dot: "#8B93A5" },
};

const UNKNOWN: Omit<ProjectTypeStyle, "label"> = { bg: "#EEF0F5", fg: "#3D4556", dot: "#8B93A5" };

/**
 * A type key's style. An unknown key keeps its own text rather than being
 * swallowed: types are added to the database before they are added here,
 * and "Unknown project type" told you nothing you could act on.
 */
export function projectTypeStyle(type: string | null | undefined): ProjectTypeStyle {
  const key = (type ?? "").trim().toLowerCase();
  const known = TYPES[key];
  if (known) return known;
  return { ...UNKNOWN, label: humanise(key) };
}

/** `some_new_type` → `Some new type`, and nothing at all → `Project`. */
function humanise(key: string): string {
  if (!key) return "Project";
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
