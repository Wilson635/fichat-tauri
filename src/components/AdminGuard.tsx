import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

interface AdminGuardProps {
  children: React.ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { user } = useAuthStore();

  if (user?.role !== "system_admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
