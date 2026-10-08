import { CSSProperties, ReactNode } from "react";

export default function Card({
  children,
  style,
  className = "",
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`cv-card ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
