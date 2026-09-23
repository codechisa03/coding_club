import { Navigate, useParams } from "react-router-dom";
import { getStudentSession } from "../lib/studentAuth";

export default function StudentProtectedRoute({ children }) {
  const { quizId } = useParams();

  // If quizId is missing/undefined, nothing to load — go to quiz list
  if (!quizId || quizId === "undefined") {
    return <Navigate to="/quizzes" replace />;
  }

  const session = getStudentSession(quizId);

  if (!session?.token) {
    return <Navigate to={`/login/${quizId}`} replace />;
  }
  return children;
}
