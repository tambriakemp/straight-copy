// How the portal Logins page splits a flat list into project groups.
//
// A login with no project stays in the list with no heading. A heading
// appears only for a project that is actually set, at the first login that
// names it, so the order the server sent is the order on the page.

import type { SharedLogin } from "@/lib/clientPortalWire";

export interface PortalLoginGroup {
  /** Null when these logins are not tied to a project. */
  projectId: string | null;
  /** Null when there is nothing to label. The page draws no heading then. */
  projectName: string | null;
  logins: SharedLogin[];
}

export function groupLoginsByProject(logins: SharedLogin[]): PortalLoginGroup[] {
  const groups: PortalLoginGroup[] = [];
  const byKey = new Map<string, PortalLoginGroup>();

  for (const login of logins) {
    const projectId = login.projectId ?? null;
    const projectName = (login.projectName ?? "").trim();
    if (!projectId && !projectName) {
      let plain = groups.find((group) => group.projectId === null && group.projectName === null);
      if (!plain) {
        plain = { projectId: null, projectName: null, logins: [] };
        groups.push(plain);
      }
      plain.logins.push(login);
      continue;
    }
    const key = projectId ?? projectName;
    let group = byKey.get(key);
    if (!group) {
      group = {
        projectId,
        projectName: projectName || "A project",
        logins: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.logins.push(login);
  }

  return groups;
}
