import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, sessionChecked } = useAuthStore();
  const { isConfigured, isInitializing } = useAppStore();
  const location = useLocation();

  // Still initializing — AppInitializer renders the spinner, don't redirect yet
  if (isInitializing || !sessionChecked) {
    return null;
  }

  if (!isConfigured) {
    return <Navigate to="/setup" state={{ from: location }} replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
