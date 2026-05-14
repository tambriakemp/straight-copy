import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScrollToTop from "@/components/ScrollToTop";
const queryClient = new QueryClient();

const Index = lazy(() => import("./pages/Index.tsx"));
const Services = lazy(() => import("./pages/Services.tsx"));
const Philosophy = lazy(() => import("./pages/Philosophy.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));
const HowItWorks = lazy(() => import("./pages/HowItWorks.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Portal = lazy(() => import("./pages/Portal.tsx"));
const PortalProject = lazy(() => import("./pages/PortalProject.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.tsx"));
const ResetPassword = lazy(() => import("./pages/admin/ResetPassword.tsx"));
const Profile = lazy(() => import("./pages/admin/Profile.tsx"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard.tsx"));
const ClientDetail = lazy(() => import("./pages/admin/ClientDetail.tsx"));
const Tokens = lazy(() => import("./pages/admin/Tokens.tsx"));
const Invites = lazy(() => import("./pages/admin/Invites.tsx"));
const Previews = lazy(() => import("./pages/admin/Previews.tsx"));
const PreviewDetail = lazy(() => import("./pages/admin/PreviewDetail.tsx"));
const ProjectDetail = lazy(() => import("./pages/admin/ProjectDetail.tsx"));
const PreviewViewer = lazy(() => import("./pages/PreviewViewer.tsx"));
const RequireAdmin = lazy(() => import("./components/admin/RequireAdmin.tsx"));
const RequireWiki = lazy(() => import("./components/admin/RequireWiki.tsx"));
const WikiList = lazy(() => import("./pages/admin/Wiki.tsx").then((module) => ({ default: module.WikiList })));
const WikiEdit = lazy(() => import("./pages/admin/Wiki.tsx").then((module) => ({ default: module.WikiEdit })));
const WikiDetail = lazy(() => import("./pages/admin/Wiki.tsx").then((module) => ({ default: module.WikiDetail })));
const WikiHistory = lazy(() => import("./pages/admin/Wiki.tsx").then((module) => ({ default: module.WikiHistory })));
const WikiUsers = lazy(() => import("./pages/admin/Wiki.tsx").then((module) => ({ default: module.WikiUsers })));
const WikiExport = lazy(() => import("./pages/admin/Wiki.tsx").then((module) => ({ default: module.WikiExport })));

function RouteFallback() {
  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Loading…</p>
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
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/services" element={<Services />} />
            <Route path="/philosophy" element={<Philosophy />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/portal/:clientId" element={<Portal />} />
            <Route path="/portal/:clientId/projects/:projectId" element={<PortalProject />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
            <Route path="/admin/profile" element={<RequireAdmin><Profile /></RequireAdmin>} />
            <Route path="/admin/clients/:id" element={<RequireAdmin><ClientDetail /></RequireAdmin>} />
            <Route path="/admin/tokens" element={<RequireAdmin><Tokens /></RequireAdmin>} />
            <Route path="/admin/invites" element={<RequireAdmin><Invites /></RequireAdmin>} />
            <Route path="/admin/previews" element={<RequireAdmin><Previews /></RequireAdmin>} />
            <Route path="/admin/previews/:id" element={<RequireAdmin><PreviewDetail /></RequireAdmin>} />
            <Route path="/admin/clients/:id/projects/:projectId" element={<RequireAdmin><ProjectDetail /></RequireAdmin>} />
            <Route path="/admin/wiki" element={<RequireWiki><WikiList /></RequireWiki>} />
            <Route path="/admin/wiki/new" element={<RequireWiki><WikiEdit mode="new" /></RequireWiki>} />
            <Route path="/admin/wiki/admin/users" element={<RequireWiki><WikiUsers /></RequireWiki>} />
            <Route path="/admin/wiki/admin/export" element={<RequireWiki><WikiExport /></RequireWiki>} />
            <Route path="/admin/wiki/:slug" element={<RequireWiki><WikiDetail /></RequireWiki>} />
            <Route path="/admin/wiki/:slug/edit" element={<RequireWiki><WikiEdit mode="edit" /></RequireWiki>} />
            <Route path="/admin/wiki/:slug/history" element={<RequireWiki><WikiHistory /></RequireWiki>} />
            <Route path="/p/:slug/*" element={<PreviewViewer />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
