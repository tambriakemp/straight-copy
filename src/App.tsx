import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScrollToTop from "@/components/ScrollToTop";
import Index from "./pages/Index.tsx";
import Services from "./pages/Services.tsx";
import Philosophy from "./pages/Philosophy.tsx";
import Contact from "./pages/Contact.tsx";
import HowItWorks from "./pages/HowItWorks.tsx";
import Privacy from "./pages/Privacy.tsx";
import Unsubscribe from "./pages/Unsubscribe.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminLogin from "./pages/admin/AdminLogin.tsx";
import Dashboard from "./pages/admin/Dashboard.tsx";
import ClientDetail from "./pages/admin/ClientDetail.tsx";
import Tokens from "./pages/admin/Tokens.tsx";
import RequireAdmin from "./components/admin/RequireAdmin.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/services" element={<Services />} />
          <Route path="/philosophy" element={<Philosophy />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
          <Route path="/admin/clients/:id" element={<RequireAdmin><ClientDetail /></RequireAdmin>} />
          <Route path="/admin/tokens" element={<RequireAdmin><Tokens /></RequireAdmin>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
