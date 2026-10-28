import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScrollToTop from "@/components/ScrollToTop";
import MetaAutoTracker from "@/components/MetaAutoTracker";

const queryClient = new QueryClient();

const Index = lazy(() => import("./pages/Index.tsx"));
const Services = lazy(() => import("./pages/Services.tsx"));
const Philosophy = lazy(() => import("./pages/Philosophy.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));
const SocialSignup = lazy(() => import("./pages/SocialSignup.tsx"));
const HowItWorks = lazy(() => import("./pages/HowItWorks.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Portal = lazy(() => import("./pages/Portal.tsx"));
// CRE-776: the client portal, mockups 13-16. These replace the old Portal
// page as the client's home; Portal itself stays, at /projects, as the list
// the new nav's Project item resolves against.
const ClientHome = lazy(() => import("./pages/portal/ClientHome.tsx"));
const ClientAgreements = lazy(() => import("./pages/portal/ClientAgreements.tsx"));
const ClientPayments = lazy(() => import("./pages/portal/ClientPayments.tsx"));
const ClientLogins = lazy(() => import("./pages/portal/ClientLogins.tsx"));
const ClientProjectJump = lazy(() => import("./pages/portal/ClientProjectJump.tsx"));
const PortalProject = lazy(() => import("./pages/PortalProject.tsx"));
const PortalProposal = lazy(() => import("./pages/PortalProposal.tsx"));
const PortalFeedback = lazy(() => import("./pages/PortalFeedback.tsx"));
const BrandKit = lazy(() => import("./pages/BrandKit.tsx"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin.tsx"));
const PortalSetPassword = lazy(() => import("./pages/portal/PortalSetPassword.tsx"));
const RequirePortalAuth = lazy(() => import("./components/portal/RequirePortalAuth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.tsx"));
const McpAuthorize = lazy(() => import("./pages/admin/McpAuthorize.tsx"));
const ResetPassword = lazy(() => import("./pages/admin/ResetPassword.tsx"));
const Settings = lazy(() => import("./pages/admin/Settings.tsx"));
const ClientsList = lazy(() => import("./pages/admin/ClientsList.tsx"));
const Today = lazy(() => import("./pages/admin/Today.tsx"));
const Portfolio = lazy(() => import("./pages/admin/Portfolio.tsx"));
const ClientDetail = lazy(() => import("./pages/admin/ClientDetail.tsx"));
const Ventures = lazy(() => import("./pages/admin/Ventures.tsx"));
const VentureDetail = lazy(() => import("./pages/admin/VentureDetail.tsx"));
const LaunchDetail = lazy(() => import("./pages/admin/LaunchDetail.tsx"));
const AgentWorkspace = lazy(() => import("./pages/admin/AgentWorkspace.tsx"));
const AgentRunDetail = lazy(() => import("./pages/admin/AgentRunDetail.tsx"));
const Invites = lazy(() => import("./pages/admin/Invites.tsx"));
const PortalAccess = lazy(() => import("./pages/admin/PortalAccess.tsx"));
const ProjectDetail = lazy(() => import("./pages/admin/ProjectDetail.tsx"));
const ProposalDetail = lazy(() => import("./pages/admin/ProposalDetail.tsx"));
const ProposalUpload = lazy(() => import("./pages/admin/ProposalUpload.tsx"));
const FeedbackBoard = lazy(() => import("./pages/admin/FeedbackBoard.tsx"));
const AllTasks = lazy(() => import("./pages/admin/AllTasks.tsx"));
const Proposals = lazy(() => import("./pages/admin/Proposals.tsx"));
const Payments = lazy(() => import("./pages/admin/Payments.tsx"));
const Social = lazy(() => import("./pages/admin/Social.tsx"));
const Approvals = lazy(() => import("./pages/admin/Approvals.tsx"));
const Audits = lazy(() => import("./pages/admin/Audits.tsx"));
const Agents = lazy(() => import("./pages/admin/Agents.tsx"));
const More = lazy(() => import("./pages/admin/More.tsx"));
const Pipeline = lazy(() => import("./pages/admin/Pipeline.tsx"));
const PreviewViewer = lazy(() => import("./pages/PreviewViewer.tsx"));
const AuditReport = lazy(() => import("./pages/AuditReport.tsx"));
const RequireAdmin = lazy(() => import("./components/admin/RequireAdmin.tsx"));

/**
 * What shows while a route's chunk is downloading.
 *
 * It used to render nothing, which was fine when the app had one theme.
 * It is not fine now: for the moment the old page has unmounted and the
 * new one has not arrived, the whole window is whatever is underneath —
 * so a route change read as a flash to a different colour scheme rather
 * than as a page loading.
 *
 * A quiet panel on the admin ground instead, with the spinner delayed:
 * a chunk that arrives in 80ms should show nothing at all, because a
 * spinner that appears and vanishes is more distracting than the wait
 * it is covering.
 */
function RouteFallback() {
  return (
    <div className="cv-routefallback" role="status" aria-live="polite">
      <span className="cv-spinner" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <MetaAutoTracker />
        <Suspense fallback={<RouteFallback />}>

          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/services" element={<Services />} />
            <Route path="/philosophy" element={<Philosophy />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/social" element={<SocialSignup />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/onboarding" element={<Onboarding />} />
            {/* CRE-536: a bare portal link no longer shows data on its own.
                RequirePortalAuth checks for either a portal session that is
                an ACTIVE member of THIS :clientId, or an admin session with
                ?as=admin (the existing preview path) — and redirects an old,
                unauthenticated link to /portal/login (with ?next= back to
                itself) rather than ever rendering the page or 404ing. */}
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal/set-password" element={<PortalSetPassword />} />
            {/* CRE-776: mockups 13-16. Real routes rather than a `?v=`
                view switcher, so a client can send "here is the payment
                page" to their bookkeeper and the back button works. */}
            {/* `demoable` on these four and nowhere else: they are the only
                screens the QA harness has fixtures for, and the only ones
                that read nothing through the browser's Supabase client.
                CRE-789 could not review any of them. See portalDemo.ts. */}
            <Route path="/portal/:clientId" element={<RequirePortalAuth demoable><ClientHome /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/agreements" element={<RequirePortalAuth demoable><ClientAgreements /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/payments" element={<RequirePortalAuth demoable><ClientPayments /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/logins" element={<RequirePortalAuth demoable><ClientLogins /></RequirePortalAuth>} />
            {/* Project and Files are drawn in the new nav and have no new
                screens: both already exist on the project page. These resolve
                a project id and hand over. */}
            <Route path="/portal/:clientId/project" element={<RequirePortalAuth><ClientProjectJump /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/files" element={<RequirePortalAuth><ClientProjectJump focus="files" /></RequirePortalAuth>} />
            {/* The old portal home, kept as the project LIST. A client with
                several projects reaches it from Project above; one with a
                single project is sent straight into it and never sees this. */}
            <Route path="/portal/:clientId/projects" element={<RequirePortalAuth><Portal /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/projects/:projectId" element={<RequirePortalAuth><PortalProject /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/proposals/:proposalId" element={<RequirePortalAuth><PortalProposal /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/brand-kit" element={<RequirePortalAuth><BrandKit /></RequirePortalAuth>} />
            {/* The feedback board, with and without a project in the path.
                The side nav links the first; the project page links the
                second, so a client who got there from a project lands on
                that project's pages rather than the first one alphabetically. */}
            <Route path="/portal/:clientId/feedback" element={<RequirePortalAuth><PortalFeedback /></RequirePortalAuth>} />
            <Route path="/portal/:clientId/projects/:projectId/feedback" element={<RequirePortalAuth><PortalFeedback /></RequirePortalAuth>} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/mcp-authorize" element={<McpAuthorize />} />
            <Route path="/admin/reset-password" element={<ResetPassword />} />
            {/* CRE-332 Phase 7: the light side-nav shell is the only admin
                layout now. Today/Money/Marketing/More/Pipeline are the real
                homes; the old routes below redirect so bookmarks and old
                links still arrive. Prospects is the real page now and
                /admin/approvals the redirect -- it was the other way round
                while the page was still called Approvals. */}
            <Route path="/admin" element={<Navigate to="/admin/today" replace />} />
            <Route path="/admin/briefs" element={<Navigate to="/admin/today" replace />} />
            <Route path="/admin/clients" element={<RequireAdmin><ClientsList /></RequireAdmin>} />
            <Route path="/admin/proposals" element={<RequireAdmin><Proposals /></RequireAdmin>} />
            {/* /new before /:id -- otherwise "new" is read as a proposal id. */}
            <Route path="/admin/proposals/new" element={<RequireAdmin><ProposalUpload /></RequireAdmin>} />
            <Route path="/admin/proposals/:id" element={<RequireAdmin><ProposalDetail /></RequireAdmin>} />
            <Route path="/admin/payments" element={<Navigate to="/admin/money" replace />} />
            <Route path="/admin/social" element={<Navigate to="/admin/marketing" replace />} />
            <Route path="/admin/approvals" element={<Navigate to="/admin/prospects" replace />} />
            <Route path="/admin/audits" element={<RequireAdmin><Audits /></RequireAdmin>} />
            <Route path="/admin/agents" element={<RequireAdmin><Agents /></RequireAdmin>} />
            <Route path="/admin/tasks" element={<RequireAdmin><AllTasks /></RequireAdmin>} />
            <Route path="/admin/today" element={<RequireAdmin><Today /></RequireAdmin>} />
            <Route path="/admin/pipeline" element={<RequireAdmin><Pipeline /></RequireAdmin>} />
            <Route path="/admin/prospects" element={<RequireAdmin><Approvals /></RequireAdmin>} />
            <Route path="/admin/money" element={<RequireAdmin><Payments /></RequireAdmin>} />
            <Route path="/admin/marketing" element={<RequireAdmin><Social /></RequireAdmin>} />
            <Route path="/admin/more" element={<RequireAdmin><More /></RequireAdmin>} />
            {/* The queue lives in the engineering queue lead's Workspace rail
                now. Kept as a redirect so bookmarks and old links still arrive,
                rather than as a second door to the same panel. */}
            <Route path="/admin/queue" element={<Navigate to="/admin/agents/developer?view=queue" replace />} />
            <Route path="/admin/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            {/* Both of these are in bookmarks and in every note that
                mentions a key, so they land on the right tab rather
                than 404. */}
            <Route path="/admin/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/admin/tokens" element={<Navigate to="/admin/settings?tab=api" replace />} />
            <Route path="/admin/clients/:id" element={<RequireAdmin><ClientDetail /></RequireAdmin>} />
            <Route path="/admin/ventures" element={<RequireAdmin><Ventures /></RequireAdmin>} />
            <Route path="/admin/ventures/:id" element={<RequireAdmin><VentureDetail /></RequireAdmin>} />
            <Route path="/admin/ventures/:id/launches/:launchId" element={<RequireAdmin><LaunchDetail /></RequireAdmin>} />
            <Route path="/admin/portfolio" element={<RequireAdmin><Portfolio /></RequireAdmin>} />
            <Route path="/admin/agents/runs/:runId" element={<RequireAdmin><AgentRunDetail /></RequireAdmin>} />
            <Route path="/admin/agents/:id" element={<RequireAdmin><AgentWorkspace /></RequireAdmin>} />
            <Route path="/admin/invites" element={<RequireAdmin><Invites /></RequireAdmin>} />
            <Route path="/admin/portal-access" element={<RequireAdmin><PortalAccess /></RequireAdmin>} />
            <Route path="/admin/clients/:id/projects/:projectId" element={<RequireAdmin><ProjectDetail /></RequireAdmin>} />
            {/* Full-bleed, outside AdminLayout on purpose: the page under
                review needs the whole window, which is the point of it. */}
            <Route path="/admin/clients/:id/projects/:projectId/feedback" element={<RequireAdmin><FeedbackBoard /></RequireAdmin>} />
            <Route path="/p/:slug/*" element={<PreviewViewer />} />
            <Route path="/audit/:slug" element={<AuditReport />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
