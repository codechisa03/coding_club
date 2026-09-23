import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { ToastProvider } from "./components/ui/Toast";
import { AdminAuthProvider } from "./lib/adminAuth";
import { StudentAccountAuthProvider } from "./lib/studentAccountAuth";
import StudentNavbar from "./components/StudentNavbar";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import StudentProtectedRoute from "./components/StudentProtectedRoute";
import StudentAccountProtectedRoute from "./components/StudentAccountProtectedRoute";

import Landing from "./pages/student/Landing";
import DemoQuiz from "./pages/student/DemoQuiz";
import Gallery from "./pages/student/Gallery";
import SignUp from "./pages/student/SignUp";
import SignIn from "./pages/student/SignIn";
import QuizLogin from "./pages/student/QuizLogin";
import QuizRunner from "./pages/student/QuizRunner";
import Result from "./pages/student/Result";
import Leaderboard from "./pages/student/Leaderboard";
import Quizzes from "./pages/student/Quizzes";
import Playground from "./pages/student/Playground";
import Dashboard from "./pages/student/Dashboard";
import Profile from "./pages/student/Profile";

// Admin portal is code-split: students never download it, so the public pages
// boot from a much smaller bundle.
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminQuizzes = lazy(() => import("./pages/admin/AdminQuizzes"));
const AdminQuizBuilder = lazy(() => import("./pages/admin/AdminQuizBuilder"));
const AdminResults = lazy(() => import("./pages/admin/AdminResults"));
const AdminLive = lazy(() => import("./pages/admin/AdminLive"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminLandingQuizzes = lazy(() => import("./pages/admin/AdminLandingQuizzes"));
const AdminLandingMedia = lazy(() => import("./pages/admin/AdminLandingMedia"));
const AdminUserAccounts = lazy(() => import("./pages/admin/AdminUserAccounts"));
const AdminGuestAccounts = lazy(() => import("./pages/admin/AdminGuestAccounts"));
const AdminLeaderboard = lazy(() => import("./pages/admin/AdminLeaderboard"));
const AdminSecurityLog = lazy(() => import("./pages/admin/AdminSecurityLog"));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-300">
      Loading...
    </div>
  );
}

function StudentShell({ children }) {
  return (
    <>
      <StudentNavbar />
      {children}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AdminAuthProvider>
        <StudentAccountAuthProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<StudentShell><Landing /></StudentShell>} />
              <Route path="/demo-quiz" element={<StudentShell><DemoQuiz /></StudentShell>} />
              <Route path="/gallery" element={<StudentShell><Gallery /></StudentShell>} />
              <Route path="/signup" element={<StudentShell><SignUp /></StudentShell>} />
              <Route path="/signin" element={<StudentShell><SignIn /></StudentShell>} />
              <Route path="/quizzes" element={<StudentShell><Quizzes /></StudentShell>} />
              <Route path="/programming" element={<StudentShell><Playground /></StudentShell>} />
              <Route
                path="/dashboard"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Dashboard /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Profile /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/login/:quizId"
                element={
                  <StudentShell><QuizLogin /></StudentShell>
                }
              />
              <Route path="/quiz/" element={<Navigate to="/quizzes" replace />} />
              <Route
                path="/quiz/:quizId"
                element={
                  <StudentProtectedRoute>
                    <QuizRunner />
                  </StudentProtectedRoute>
                }
              />
              <Route path="/result/:quizId" element={<StudentShell><Result /></StudentShell>} />
              <Route path="/leaderboard/:quizId" element={<StudentShell><Leaderboard /></StudentShell>} />

              <Route path="/admin" element={<AdminLogin />} />
              <Route
                path="/admin/dashboard"
                element={
                  <AdminProtectedRoute>
                    <AdminDashboard />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/quizzes"
                element={
                  <AdminProtectedRoute>
                    <AdminQuizzes />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/quizzes/:quizId"
                element={
                  <AdminProtectedRoute>
                    <AdminQuizBuilder />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/landing-quizzes"
                element={
                  <AdminProtectedRoute>
                    <AdminLandingQuizzes />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/landing-quizzes/:quizId"
                element={
                  <AdminProtectedRoute>
                    <AdminQuizBuilder />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/landing-media"
                element={
                  <AdminProtectedRoute>
                    <AdminLandingMedia />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/user-accounts"
                element={
                  <AdminProtectedRoute>
                    <AdminUserAccounts />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/guest-accounts"
                element={
                  <AdminProtectedRoute>
                    <AdminGuestAccounts />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/results"
                element={
                  <AdminProtectedRoute>
                    <AdminResults />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/leaderboard"
                element={
                  <AdminProtectedRoute>
                    <AdminLeaderboard />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/live"
                element={
                  <AdminProtectedRoute>
                    <AdminLive />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/security-log"
                element={
                  <AdminProtectedRoute>
                    <AdminSecurityLog />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminProtectedRoute>
                    <AdminSettings />
                  </AdminProtectedRoute>
                }
              />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </StudentAccountAuthProvider>
      </AdminAuthProvider>
    </ToastProvider>
  );
}
