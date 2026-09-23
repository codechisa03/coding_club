import { Navigate, useLocation } from "react-router-dom";
import { useStudentAccountAuth } from "../lib/studentAccountAuth";

export default function StudentAccountProtectedRoute({ children }) {
  const { isAuthenticated } = useStudentAccountAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }
  return children;
}
