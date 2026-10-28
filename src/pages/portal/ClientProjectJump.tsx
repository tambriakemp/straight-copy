// "Project" and "Files" in the new nav, which have no screens of their own.
//
// Mockup 13 draws six nav items and mockups 13-16 draw four screens. The
// other two already exist -- the project page and its Files tab -- and the
// brief says to ask before adding or renaming UI, so neither was redrawn.
// What they lacked was an address: both live under
// `/portal/:clientId/projects/:projectId`, and the nav does not know a
// project id.
//
// This resolves one and gets out of the way. It renders a line of text for
// the moment it takes and then replaces itself in the history, so Back from
// the project page returns to wherever the client actually came from rather
// than to a redirect that sends them straight forward again.
//
// A client with ONE project goes straight into it. A client with several is
// sent to the list instead of being guessed at: the home screen's progress
// bar does guess, because a hero with two progress bars is not a hero, but a
// nav item called "Project" that silently picks one of three is a nav item
// that hides two.

import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { portalFetch } from "@/lib/portalFetch";
import { useAdminPreview } from "@/components/portal/useClientPortal";

export default function ClientProjectJump({ focus }: { focus?: "files" }) {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const { adminPreview } = useAdminPreview(clientId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [choose, setChoose] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await portalFetch(
          "brand-kit-intake",
          { clientId, action: "resolve", asAdmin: adminPreview },
          adminPreview,
        );
        if (!response.ok) throw new Error("resolve failed");
        const data = (await response.json()) as {
          projects?: Array<{ id: string; status?: string; updated_at?: string }>;
        };
        if (cancelled) return;
        const live = (data.projects ?? [])
          .filter((project) => project.status !== "archived")
          .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
        if (live.length === 0) setMissing(true);
        else if (live.length > 1) setChoose(true);
        else setProjectId(live[0]!.id);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, adminPreview]);

  if (choose) {
    const query = searchParams.toString();
    return <Navigate replace to={`/portal/${clientId}/projects${query ? `?${query}` : ""}`} />;
  }

  if (projectId) {
    const next = new URLSearchParams(searchParams);
    if (focus) next.set("focus", focus);
    const query = next.toString();
    return (
      <Navigate
        replace
        to={`/portal/${clientId}/projects/${projectId}${query ? `?${query}` : ""}`}
      />
    );
  }

  if (missing) {
    // Said plainly rather than redirected into a 404. A client with no
    // project yet is an ordinary state early in an engagement.
    return (
      <div className="cp">
        <div className="cp__main">
          <div className="cp__state">
            Your project has not been set up yet. We will tell you when it is.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp">
      <div className="cp__main">
        <div className="cp__state" role="status">
          Opening your project…
        </div>
      </div>
    </div>
  );
}
