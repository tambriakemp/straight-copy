import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminShell from "./cv/AdminShell";

// CRE-332 Phase 7: the light side-nav shell is the only admin layout now.
// Every admin page wraps itself in AdminLayout, so this re-shells all of
// them at once rather than one route at a time.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  return <AdminShell isMobile={isMobile}>{children}</AdminShell>;
}
