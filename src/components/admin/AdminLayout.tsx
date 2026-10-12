import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminShell from "./cv/AdminShell";

// CRE-332 Phase 7: the light side-nav shell is the only admin layout now.
// Every admin page wraps itself in AdminLayout, so this re-shells all of
// them at once rather than one route at a time.
/**
 * @param topBar Search / notifications / New. Off on Today, which opens
 *   with its own header and the brief.
 * @param dark For the pages that have NOT migrated off the dark design
 *   and still need a dark ground under their own markup. Default light:
 *   a dark ground under a light page is what made every route change
 *   flash black.
 */
export default function AdminLayout({
  children, topBar = true, dark = false,
}: { children: ReactNode; topBar?: boolean; dark?: boolean }) {
  const isMobile = useIsMobile();
  return <AdminShell isMobile={isMobile} topBar={topBar} dark={dark}>{children}</AdminShell>;
}
