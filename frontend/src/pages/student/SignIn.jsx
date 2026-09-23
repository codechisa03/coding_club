import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Hash, Lock, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import Button from "../../components/ui/Button";
import Logo from "../../components/Logo";
import { useToast } from "../../components/ui/Toast";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { ApiError } from "../../lib/api";

const textInputCls = "field-input py-3 pl-10 pr-4 text-sm";

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { signIn } = useStudentAccountAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const validate = () => {
    const errors = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Valid email address is required.";
    }
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await signIn(email.trim(), password);
      push(`Welcome back, ${data.student.name}!`, "success");
      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (err) {
      console.error("SignIn error: ", err);
      const message = err instanceof ApiError ? err.message : (err.message || "Sign in failed. Please try again.");
      push(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-100 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="glass-panel p-8">
          <Logo />
          <h1 className="mt-6 font-display text-xl font-semibold text-ink-100">Sign in</h1>
          <p className="mt-1 text-sm text-ink-500">Use your email and password to reach your Dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div>
              <label htmlFor="signin-email" className="field-label">
                Email ID
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={textInputCls}
                />
              </div>
              {fieldErrors.email && <p className="mt-1.5 text-xs text-coral">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="signin-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="field-input py-3 pl-10 pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="mt-1.5 text-xs text-coral">{fieldErrors.password}</p>}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-500">
            Don&rsquo;t have an account?{" "}
            <Link to="/signup" state={location.state} className="font-medium text-electric-light hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
