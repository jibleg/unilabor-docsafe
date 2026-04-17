import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer, Zoom } from 'react-toastify';
import { ModuleGuard } from './components/ModuleGuard';
import { RoleGate } from './components/RoleGate';
import { QualityLayout } from './layouts/QualityLayout';
import { RhLayout } from './layouts/RhLayout';
import { AuditPage } from './pages/AuditPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ChangePasswordPage } from './pages/ChangePassword';
import { DashboardHome } from './pages/DashboardHome';
import { DocumentSectionsPage } from './pages/DocumentSectionsPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentTypesPage } from './pages/DocumentTypesPage';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { LoginPage } from './pages/Login';
import { ModuleSelectorPage } from './pages/ModuleSelectorPage';
import { ProfilePage } from './pages/ProfilePage';
import { RhDashboardPage } from './pages/RhDashboardPage';
import { RhEmployeesPage } from './pages/RhEmployeesPage';
import { RhExpedientsPage } from './pages/RhExpedientsPage';
import { UsersPage } from './pages/UsersPage';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
  <BrowserRouter>
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
        <Route index element={<RhDashboardPage />} />
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
              <RhExpedientsPage />
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

      <Route path="/dashboard" element={<Navigate to="/quality/dashboard" replace />} />
      <Route path="/profile" element={<Navigate to="/quality/profile" replace />} />
      <Route path="/documents" element={<Navigate to="/quality/documents" replace />} />
      <Route path="/categories" element={<Navigate to="/quality/categories" replace />} />
      <Route path="/users" element={<Navigate to="/quality/users" replace />} />
      <Route path="/audit" element={<Navigate to="/quality/audit" replace />} />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
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
