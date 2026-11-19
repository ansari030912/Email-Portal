import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { StepUpProvider } from "./context/StepUpContext";
import AppShell from "./layouts/AppShell";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import MailPage from "./pages/mail/MailPage";
import SettingsPage from "./pages/settings/SettingsPage";
import UsersPage from "./pages/admin/UsersPage";
import MailboxesPage from "./pages/admin/MailboxesPage";
import ProjectsPage from "./pages/admin/ProjectsPage";
import ActivityPage from "./pages/admin/ActivityPage";
import ReferralsPage from "./pages/admin/ReferralsPage";
import { AppBootSkeleton } from "./components/Skeletons";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AppBootSkeleton />;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AppBootSkeleton />;
  return user ? <Navigate to="/mail" replace /> : children;
}

function SuperAdminOnly({ children }) {
  const { user } = useAuth();
  return user?.role === "SuperAdmin" ? children : <Navigate to="/mail" replace />;
}

export default function App() {
  return (
    <StepUpProvider>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/mail" element={<MailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin/users" element={<SuperAdminOnly><UsersPage /></SuperAdminOnly>} />
          <Route path="/admin/mailboxes" element={<SuperAdminOnly><MailboxesPage /></SuperAdminOnly>} />
          <Route path="/admin/projects" element={<SuperAdminOnly><ProjectsPage /></SuperAdminOnly>} />
          <Route path="/admin/activity" element={<SuperAdminOnly><ActivityPage /></SuperAdminOnly>} />
          <Route path="/admin/referrals" element={<SuperAdminOnly><ReferralsPage /></SuperAdminOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/mail" replace />} />
      </Routes>
    </StepUpProvider>
  );
}
