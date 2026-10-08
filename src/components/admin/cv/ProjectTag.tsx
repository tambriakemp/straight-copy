import { projectTagStyle } from "@/lib/projectTags";

export default function ProjectTag({ project }: { project: string }) {
  const style = projectTagStyle(project);
  return (
    <span className="cv-ptag" style={{ background: style.bg, color: style.fg, borderColor: style.border }}>
      {style.label}
    </span>
  );
}
