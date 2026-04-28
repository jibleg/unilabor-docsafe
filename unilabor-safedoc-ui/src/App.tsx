import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RhHomeRedirect } from './components/RhHomeRedirect';
import { ToastContainer, Zoom } from 'react-toastify';
import { ModuleGuard } from './components/ModuleGuard';
import { RoleGate } from './components/RoleGate';
import { QualityLayout } from './layouts/QualityLayout';
import { RhLayout } from './layouts/RhLayout';
import { HelpdeskLayout } from './layouts/HelpdeskLayout';
import 'react-toastify/dist/ReactToastify.css';

const AuditPage = lazy(() => import('./pages/AuditPage').then((module) => ({ default: module.AuditPage })));
const CategoriesPage = lazy(() =>
  import('./pages/CategoriesPage').then((module) => ({ default: module.CategoriesPage })),
);
const ChangePasswordPage = lazy(() =>
  import('./pages/ChangePassword').then((module) => ({ default: module.ChangePasswordPage })),
);
const DashboardHome = lazy(() =>
  import('./pages/DashboardHome').then((module) => ({ default: module.DashboardHome })),
);
const DocumentSectionsPage = lazy(() =>
  import('./pages/DocumentSectionsPage').then((module) => ({ default: module.DocumentSectionsPage })),
);
const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((module) => ({ default: module.DocumentsPage })),
);
const DocumentTypesPage = lazy(() =>
  import('./pages/DocumentTypesPage').then((module) => ({ default: module.DocumentTypesPage })),
);
const EmployeeExpedientPage = lazy(() =>
  import('./pages/EmployeeExpedientPage').then((module) => ({ default: module.EmployeeExpedientPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPassword').then((module) => ({ default: module.ForgotPasswordPage })),
);
const HelpdeskAssetsPage = lazy(() =>
  import('./pages/HelpdeskAssetsPage').then((module) => ({ default: module.HelpdeskAssetsPage })),
);
const HelpdeskDashboardPage = lazy(() =>
  import('./pages/HelpdeskDashboardPage').then((module) => ({ default: module.HelpdeskDashboardPage })),
);
const HelpdeskCatalogsPage = lazy(() =>
  import('./pages/HelpdeskCatalogsPage').then((module) => ({ default: module.HelpdeskCatalogsPage })),
);
const HelpdeskMaintenancePage = lazy(() =>
  import('./pages/HelpdeskMaintenancePage').then((module) => ({ default: module.HelpdeskMaintenancePage })),
);
const HelpdeskMyPortalPage = lazy(() =>
  import('./pages/HelpdeskMyPortalPage').then((module) => ({ default: module.HelpdeskMyPortalPage })),
);
const HelpdeskTicketsPage = lazy(() =>
  import('./pages/HelpdeskTicketsPage').then((module) => ({ default: module.HelpdeskTicketsPage })),
);
const LoginPage = lazy(() => import('./pages/Login').then((module) => ({ default: module.LoginPage })));
const ModuleSelectorPage = lazy(() =>
  import('./pages/ModuleSelectorPage').then((module) => ({ default: module.ModuleSelectorPage })),
);
const MyExpedientPage = lazy(() =>
  import('./pages/MyExpedientPage').then((module) => ({ default: module.MyExpedientPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const RhAlertsPage = lazy(() =>
  import('./pages/RhAlertsPage').then((module) => ({ default: module.RhAlertsPage })),
);
const RhAuditPage = lazy(() =>
  import('./pages/RhAuditPage').then((module) => ({ default: module.RhAuditPage })),
);
const RhDashboardPage = lazy(() =>
  import('./pages/RhDashboardPage').then((module) => ({ default: module.RhDashboardPage })),
);
const RhEmployeesPage = lazy(() =>
  import('./pages/RhEmployeesPage').then((module) => ({ default: module.RhEmployeesPage })),
);
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center text-sm text-slate-600">
    Cargando modulo...
  </div>
);

function App() {
  return (
  <BrowserRouter>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/select-module" element={<ModuleSelectorPage />} />

      {/* Todas estas rutas tendrán el Sidebar automático */}
      <Route
        path="/quality"
        element={
          <ModuleGuard moduleCode="QUALITY">
            <QualityLayout />
          </ModuleGuard>
        }
      >
        <Route path="dashboard" element={<DashboardHome />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route
          path="users"
          element={
            <RoleGate allowedRoles={['ADMIN']} redirectTo="/quality/dashboard">
              <UsersPage />
            </RoleGate>
          }
        />
        <Route
          path="categories"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/quality/dashboard">
              <CategoriesPage />
            </RoleGate>
          }
        />
        <Route
          path="audit"
          element={
            <RoleGate allowedRoles={['ADMIN']} redirectTo="/quality/dashboard">
              <AuditPage />
            </RoleGate>
          }
        />
      </Route>

      <Route
        path="/rh"
        element={
          <ModuleGuard moduleCode="RH">
            <RhLayout />
          </ModuleGuard>
        }
      >
        <Route index element={<RhHomeRedirect />} />
        <Route
          path="dashboard"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhDashboardPage />
            </RoleGate>
          }
        />
        <Route
          path="employees"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhEmployeesPage />
            </RoleGate>
          }
        />
        <Route
          path="expedients"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <EmployeeExpedientPage />
            </RoleGate>
          }
        />
        <Route
          path="alerts"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhAlertsPage />
            </RoleGate>
          }
        />
        <Route
          path="audit"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhAuditPage />
            </RoleGate>
          }
        />
        <Route
          path="my-expedient"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR', 'VIEWER']} redirectTo="/rh">
              <MyExpedientPage />
            </RoleGate>
          }
        />
        <Route
          path="document-sections"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <DocumentSectionsPage />
            </RoleGate>
          }
        />
        <Route
          path="document-types"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <DocumentTypesPage />
            </RoleGate>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route
        path="/helpdesk"
        element={
          <ModuleGuard moduleCode="HELPDESK">
            <HelpdeskLayout />
          </ModuleGuard>
        }
      >
        <Route index element={<Navigate to="/helpdesk/dashboard" replace />} />
        <Route path="dashboard" element={<HelpdeskDashboardPage />} />
        <Route path="my-portal" element={<HelpdeskMyPortalPage />} />
        <Route path="assets" element={<HelpdeskAssetsPage />} />
        <Route
          path="tickets"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskTicketsPage />
            </RoleGate>
          }
        />
        <Route path="maintenance" element={<HelpdeskMaintenancePage />} />
        <Route
          path="catalogs"
          element={
            <RoleGate allowedRoles={['ADMIN']} redirectTo="/helpdesk/dashboard">
              <HelpdeskCatalogsPage />
            </RoleGate>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/dashboard" element={<Navigate to="/quality/dashboard" replace />} />
      <Route path="/profile" element={<Navigate to="/quality/profile" replace />} />
      <Route path="/documents" element={<Navigate to="/quality/documents" replace />} />
      <Route path="/categories" element={<Navigate to="/quality/categories" replace />} />
      <Route path="/users" element={<Navigate to="/quality/users" replace />} />
      <Route path="/audit" element={<Navigate to="/quality/audit" replace />} />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
    </Suspense>
    <ToastContainer
      position="top-center"
      autoClose={5000}
      hideProgressBar={false}
      closeOnClick
      pauseOnHover
      draggable={false}
      newestOnTop
      theme="light"
      transition={Zoom}
      className="unilabor-toast-container"
      toastClassName="unilabor-toast"
      progressClassName="unilabor-toast-progress"
    />
  </BrowserRouter>
  );
}

export default App;
