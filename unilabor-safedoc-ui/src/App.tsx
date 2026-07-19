import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RhHomeRedirect } from './components/RhHomeRedirect';
import { AdminHomeRedirect } from './components/AdminHomeRedirect';
import { ToastContainer, Slide } from 'react-toastify';
import { ModuleGuard } from './components/ModuleGuard';
import { RoleGate } from './components/RoleGate';
import { PermissionGate } from './components/PermissionGate';
import { ConfirmHost } from './components/ConfirmHost';
import { QualityLayout } from './layouts/QualityLayout';
import { RhLayout } from './layouts/RhLayout';
import { HelpdeskLayout } from './layouts/HelpdeskLayout';
import { AdminLayout } from './layouts/AdminLayout';
import 'react-toastify/dist/ReactToastify.css';

const AuditPage = lazy(() => import('./pages/AuditPage').then((module) => ({ default: module.AuditPage })));
const RolesPage = lazy(() => import('./pages/RolesPage').then((module) => ({ default: module.RolesPage })));
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
const HelpdeskAssetExpedientPage = lazy(() =>
  import('./pages/HelpdeskAssetExpedientPage').then((module) => ({ default: module.HelpdeskAssetExpedientPage })),
);
const HelpdeskLifecycleEventPage = lazy(() =>
  import('./pages/HelpdeskLifecycleEventPage').then((module) => ({ default: module.HelpdeskLifecycleEventPage })),
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
const HelpdeskCalibrationPage = lazy(() =>
  import('./pages/HelpdeskCalibrationPage').then((module) => ({ default: module.HelpdeskCalibrationPage })),
);
const HelpdeskServiceCalendarPage = lazy(() =>
  import('./pages/HelpdeskServiceCalendarPage').then((module) => ({ default: module.HelpdeskServiceCalendarPage })),
);
const HelpdeskOrgStructurePage = lazy(() =>
  import('./pages/HelpdeskOrgStructurePage').then((module) => ({ default: module.HelpdeskOrgStructurePage })),
);
const HelpdeskHandoversPage = lazy(() =>
  import('./pages/HelpdeskHandoversPage').then((module) => ({ default: module.HelpdeskHandoversPage })),
);
const HelpdeskMovementsPage = lazy(() =>
  import('./pages/HelpdeskMovementsPage').then((module) => ({ default: module.HelpdeskMovementsPage })),
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
const MyEvaluationsPage = lazy(() =>
  import('./pages/MyEvaluationsPage').then((module) => ({ default: module.MyEvaluationsPage })),
);
const TakeEvaluationPage = lazy(() =>
  import('./pages/TakeEvaluationPage').then((module) => ({ default: module.TakeEvaluationPage })),
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
const RhTrainingsPage = lazy(() =>
  import('./pages/RhTrainingsPage').then((module) => ({ default: module.RhTrainingsPage })),
);
const RhGradingPage = lazy(() =>
  import('./pages/RhGradingPage').then((module) => ({ default: module.RhGradingPage })),
);
const RhNotificationsPage = lazy(() =>
  import('./pages/RhNotificationsPage').then((module) => ({ default: module.RhNotificationsPage })),
);
const RhLateRequestsPage = lazy(() =>
  import('./pages/RhLateRequestsPage').then((module) => ({ default: module.RhLateRequestsPage })),
);
const RhTrainingDashboardPage = lazy(() =>
  import('./pages/RhTrainingDashboardPage').then((module) => ({ default: module.RhTrainingDashboardPage })),
);
const RhPracticalCapturePage = lazy(() =>
  import('./pages/RhPracticalCapturePage').then((module) => ({ default: module.RhPracticalCapturePage })),
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
          path="categories"
          element={
            <PermissionGate permission="QUALITY.CATEGORIES.WRITE" redirectTo="/quality/dashboard">
              <CategoriesPage />
            </PermissionGate>
          }
        />
      </Route>

      {/* Módulo Administración del sistema (usuarios, roles y auditoría) */}
      <Route
        path="/admin"
        element={
          <ModuleGuard moduleCode="ADMIN">
            <AdminLayout />
          </ModuleGuard>
        }
      >
        <Route index element={<AdminHomeRedirect />} />
        <Route
          path="users"
          element={
            <PermissionGate permission="ADMIN.USERS.READ" redirectTo="/admin">
              <UsersPage />
            </PermissionGate>
          }
        />
        <Route
          path="roles"
          element={
            <PermissionGate permission="ADMIN.ROLES.MANAGE" redirectTo="/admin">
              <RolesPage />
            </PermissionGate>
          }
        />
        <Route
          path="audit"
          element={
            <PermissionGate permission="ADMIN.AUDIT.READ" redirectTo="/admin">
              <AuditPage />
            </PermissionGate>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
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
          path="trainings"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhTrainingsPage />
            </RoleGate>
          }
        />
        <Route
          path="grading"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhGradingPage />
            </RoleGate>
          }
        />
        <Route
          path="practical-capture"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhPracticalCapturePage />
            </RoleGate>
          }
        />
        <Route
          path="notifications"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhNotificationsPage />
            </RoleGate>
          }
        />
        <Route
          path="late-requests"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhLateRequestsPage />
            </RoleGate>
          }
        />
        <Route
          path="training-dashboard"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/rh">
              <RhTrainingDashboardPage />
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
          path="my-evaluations"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR', 'VIEWER']} redirectTo="/rh">
              <MyEvaluationsPage />
            </RoleGate>
          }
        />
        <Route
          path="my-evaluations/:id"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR', 'VIEWER']} redirectTo="/rh">
              <TakeEvaluationPage />
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
        <Route
          path="assets"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskAssetsPage />
            </RoleGate>
          }
        />
        <Route
          path="assets/:id/expedient"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskAssetExpedientPage />
            </RoleGate>
          }
        />
        <Route
          path="assets/:id/events/:eventId"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskLifecycleEventPage />
            </RoleGate>
          }
        />
        <Route
          path="tickets"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskTicketsPage />
            </RoleGate>
          }
        />
        <Route
          path="maintenance"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskMaintenancePage />
            </RoleGate>
          }
        />
        <Route
          path="calibration"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskCalibrationPage />
            </RoleGate>
          }
        />
        <Route
          path="service-calendar"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskServiceCalendarPage />
            </RoleGate>
          }
        />
        <Route
          path="handovers"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskHandoversPage />
            </RoleGate>
          }
        />
        <Route
          path="movements"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']} redirectTo="/helpdesk/my-portal">
              <HelpdeskMovementsPage />
            </RoleGate>
          }
        />
        <Route
          path="catalogs"
          element={
            <RoleGate allowedRoles={['ADMIN']} redirectTo="/helpdesk/dashboard">
              <HelpdeskCatalogsPage />
            </RoleGate>
          }
        />
        <Route
          path="org-structure"
          element={
            <RoleGate allowedRoles={['ADMIN']} redirectTo="/helpdesk/dashboard">
              <HelpdeskOrgStructurePage />
            </RoleGate>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/dashboard" element={<Navigate to="/quality/dashboard" replace />} />
      <Route path="/profile" element={<Navigate to="/quality/profile" replace />} />
      <Route path="/documents" element={<Navigate to="/quality/documents" replace />} />
      <Route path="/categories" element={<Navigate to="/quality/categories" replace />} />
      <Route path="/users" element={<Navigate to="/admin/users" replace />} />
      <Route path="/audit" element={<Navigate to="/admin/audit" replace />} />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
    </Suspense>
    <ToastContainer
      position="bottom-right"
      autoClose={4000}
      hideProgressBar={false}
      closeOnClick
      pauseOnHover
      draggable={false}
      newestOnTop
      theme="light"
      transition={Slide}
      className="unilabor-toast-container"
      toastClassName="unilabor-toast"
      progressClassName="unilabor-toast-progress"
    />
    <ConfirmHost />
  </BrowserRouter>
  );
}

export default App;
