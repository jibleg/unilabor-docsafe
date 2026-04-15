import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer, Zoom } from 'react-toastify';
import { LoginPage } from './pages/Login';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { MainLayout } from './layouts/MainLayout';
import { DashboardHome } from './pages/DashboardHome';
import { UsersPage } from './pages/UsersPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { AuditPage } from './pages/AuditPage';
import { ChangePasswordPage } from './pages/ChangePassword';
import { CategoriesPage } from './pages/CategoriesPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoleGate } from './components/RoleGate';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Todas estas rutas tendrán el Sidebar automático */}
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<DashboardHome />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/users"
          element={
            <RoleGate allowedRoles={['ADMIN']}>
              <UsersPage />
            </RoleGate>
          }
        />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route
          path="/categories"
          element={
            <RoleGate allowedRoles={['ADMIN', 'EDITOR']}>
              <CategoriesPage />
            </RoleGate>
          }
        />
        <Route path="/audit" element={<AuditPage />} /> 
      </Route>

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
      theme="dark"
      transition={Zoom}
      className="unilabor-toast-container"
      toastClassName="unilabor-toast"
    />
  </BrowserRouter>
  );
}

export default App;
