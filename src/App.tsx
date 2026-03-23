import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

import Auth from "./pages/Auth";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import { ProviderLayout } from "./components/provider/ProviderLayout";
import { ClientLayout } from "./components/client/ClientLayout";
import AdminLayout from "./components/admin/AdminLayout";

import Dashboard from "./pages/provider/Dashboard";
import Customers from "./pages/provider/Customers";
import CustomerDetail from "./pages/provider/CustomerDetail";
import CustomerManage from "./pages/provider/CustomerManage";
import PropertyDetail from "./pages/provider/PropertyDetail";
import ServiceCatalog from "./pages/provider/ServiceCatalog";

import ContractDetail from "./pages/provider/ContractDetail";
import ServiceVisits from "./pages/provider/ServiceVisits";
import VisitDetail from "./pages/provider/VisitDetail";
import FeedbackPage from "./pages/provider/Feedback";
import InspectionDetail from "./pages/provider/InspectionDetail";
import OfferDetail from "./pages/provider/OfferDetail";
import SalesPipeline from "./pages/provider/SalesPipeline";
import ProviderSettings from "./pages/provider/Settings";

import ClientDashboard from "./pages/client/ClientDashboard";
import ClientPropertyDetail from "./pages/client/ClientPropertyDetail";
import ClientVisits from "./pages/client/ClientVisits";
import ClientVisitDetail from "./pages/client/ClientVisitDetail";
import ClientFeedback from "./pages/client/ClientFeedback";
import ClientContracts from "./pages/client/ClientContracts";
import ClientContractDetail from "./pages/client/ClientContractDetail";
import ClientOffers from "./pages/client/ClientOffers";
import ClientOfferDetail from "./pages/client/ClientOfferDetail";
import ClientProfile from "./pages/client/ClientProfile";
import ClientConnect from "./pages/client/ClientConnect";

import AdminInvites from "./pages/admin/AdminInvites";
import AdminOnboard from "./pages/admin/AdminOnboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import TenantManagement from "./pages/admin/TenantManagement";
import GlobalUserManagement from "./pages/admin/GlobalUserManagement";
import AuditCompliance from "./pages/admin/AuditCompliance";
import SecurityMonitor from "./pages/admin/SecurityMonitor";
import ResetPassword from "./pages/ResetPassword";
import Unsubscribe from "./pages/Unsubscribe";

const queryClient = new QueryClient();


function AppRoutes(): JSX.Element {
  const { user, isProvider, isClient, isSuperAdmin, isLoading, signOut } = useAuth();

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
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/onboard" element={<AdminOnboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Authenticated but no role yet (e.g. fresh signup)
  if (!isProvider && !isClient && !isSuperAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <h1 className="mb-2 text-2xl font-bold">Welcome to GreenCRM</h1>
        <p className="mb-6 text-muted-foreground">Your account is created, but you haven't been assigned a role yet.</p>
        <div className="rounded-lg bg-muted p-4 text-sm text-left max-w-md">
          <p className="font-semibold mb-2">Next Steps:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>If you are a provider, contact your admin to elevate your role.</li>
            <li>If you just signed up, wait for an administrator to approve your connection.</li>
            <li>Use the bootstrap script to set up your first tenant.</li>
          </ul>
        </div>
        <Button variant="outline" className="mt-8" onClick={() => signOut()}>Sign Out</Button>
      </div>
    );
  }

  return (
    <Routes>
      {/* Super Admin */}
      {isSuperAdmin && (
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="tenants" element={<TenantManagement />} />
          <Route path="users" element={<GlobalUserManagement />} />
          <Route path="audit" element={<AuditCompliance />} />
          <Route path="security" element={<SecurityMonitor />} />
          <Route path="invites" element={<AdminInvites />} />
          <Route path="onboard" element={<AdminOnboard />} />
        </Route>
      )}

      {/* Provider routes — block pure clients */}
      <Route path="/provider" element={
        isClient && !isProvider ? <Navigate to="/client" replace /> : <ProviderLayout />
      }>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:customerId" element={<CustomerDetail />} />
        <Route path="customers/:customerId/manage" element={<CustomerManage />} />
        <Route path="properties/:propertyId" element={<PropertyDetail />} />
        <Route path="catalog" element={<ServiceCatalog />} />
        <Route path="pipeline" element={<SalesPipeline />} />
        <Route path="inspections" element={<Navigate to="/provider/pipeline" replace />} />
        <Route path="inspections/:inspectionId" element={<InspectionDetail />} />
        <Route path="offers" element={<Navigate to="/provider/pipeline" replace />} />
        <Route path="offers/:offerId" element={<OfferDetail />} />
        <Route path="contracts" element={<Navigate to="/provider/pipeline" replace />} />
        <Route path="contracts/:contractId" element={<ContractDetail />} />
        <Route path="visits" element={<ServiceVisits />} />
        <Route path="visits/:visitId" element={<VisitDetail />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="settings" element={<ProviderSettings />} />
      </Route>

      {/* Client routes — block providers */}
      <Route path="/client" element={
        isProvider && !isClient ? <Navigate to="/provider" replace /> : <ClientLayout />
      }>
        <Route index element={<ClientDashboard />} />
        <Route path="offers" element={<ClientOffers />} />
        <Route path="offers/:offerId" element={<ClientOfferDetail />} />
        <Route path="contracts" element={<ClientContracts />} />
        <Route path="contracts/:contractId" element={<ClientContractDetail />} />
        <Route path="properties/:propertyId" element={<ClientPropertyDetail />} />
        <Route path="visits" element={<ClientVisits />} />
        <Route path="visits/:visitId" element={<ClientVisitDetail />} />
        <Route path="feedback" element={<ClientFeedback />} />
        <Route path="profile" element={<ClientProfile />} />
        <Route path="connect" element={<ClientConnect />} />
      </Route>

      {/* Default redirect based on role */}
      <Route path="/" element={
        isSuperAdmin && !isProvider && !isClient ? <Navigate to="/admin" replace /> :
          isProvider ? <Navigate to="/provider" replace /> :
            isClient ? <Navigate to="/client" replace /> :
              <Navigate to="/auth" replace />
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
