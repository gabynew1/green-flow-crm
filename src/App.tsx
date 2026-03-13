import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { ProviderLayout } from "./components/provider/ProviderLayout";
import { ClientLayout } from "./components/client/ClientLayout";

import Dashboard from "./pages/provider/Dashboard";
import Customers from "./pages/provider/Customers";
import CustomerDetail from "./pages/provider/CustomerDetail";
import PropertyDetail from "./pages/provider/PropertyDetail";
import ServiceCatalog from "./pages/provider/ServiceCatalog";
import Contracts from "./pages/provider/Contracts";
import ContractDetail from "./pages/provider/ContractDetail";
import ServiceVisits from "./pages/provider/ServiceVisits";
import VisitDetail from "./pages/provider/VisitDetail";
import FeedbackPage from "./pages/provider/Feedback";

import ClientDashboard from "./pages/client/ClientDashboard";
import ClientPropertyDetail from "./pages/client/ClientPropertyDetail";
import ClientVisits from "./pages/client/ClientVisits";
import ClientVisitDetail from "./pages/client/ClientVisitDetail";
import ClientFeedback from "./pages/client/ClientFeedback";

import AdminInvites from "./pages/admin/AdminInvites";
import ResetPassword from "./pages/ResetPassword";

const queryClient = new QueryClient();

function AppRoutes(): JSX.Element {
  const { user, isProvider, isClient, isSuperAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Super Admin */}
      {isSuperAdmin && (
        <Route path="/admin" element={<AdminInvites />} />
      )}

      {/* Provider routes */}
      <Route path="/provider" element={<ProviderLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:customerId" element={<CustomerDetail />} />
        <Route path="properties/:propertyId" element={<PropertyDetail />} />
        <Route path="catalog" element={<ServiceCatalog />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="contracts/:contractId" element={<ContractDetail />} />
        <Route path="visits" element={<ServiceVisits />} />
        <Route path="visits/:visitId" element={<VisitDetail />} />
        <Route path="feedback" element={<FeedbackPage />} />
      </Route>

      {/* Client routes */}
      <Route path="/client" element={<ClientLayout />}>
        <Route index element={<ClientDashboard />} />
        <Route path="properties/:propertyId" element={<ClientPropertyDetail />} />
        <Route path="visits" element={<ClientVisits />} />
        <Route path="visits/:visitId" element={<ClientVisitDetail />} />
        <Route path="feedback" element={<ClientFeedback />} />
      </Route>

      {/* Default redirect based on role */}
      <Route path="/" element={
        isSuperAdmin && !isProvider && !isClient ? <Navigate to="/admin" replace /> :
        isProvider ? <Navigate to="/provider" replace /> :
        isClient ? <Navigate to="/client" replace /> :
        <Navigate to="/client" replace />
      } />

      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
