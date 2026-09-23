import { useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  User,
  Hash,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  Check,
  X,
  Building2,
  Users,
  Clock,
  CalendarRange,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Logo from "../../components/Logo";
import YearPicker from "../../components/ui/YearPicker";
import { useToast } from "../../components/ui/Toast";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { ApiError } from "../../lib/api";
import { passwordRuleResults, isStrongPassword } from "../../lib/passwordPolicy";
import {
  DEPARTMENTS,
  SECTIONS,
  getEndYearOptions,
  FUTURE_YEARS_AHEAD,
  PAST_YEARS_BACK,
} from "../../lib/options";

const textInputCls = "field-input py-3 pl-10 pr-4 text-sm";
const selectCls = "field-input py-3 pl-10 pr-8 text-sm";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { signUp } = useStudentAccountAuth();

  const [username, setUsername] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [section, setSection] = useState("");
  const [batchStart, setBatchStart] = useState("");
  const [batchEnd, setBatchEnd] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const passwordRules = useMemo(() => passwordRuleResults(password), [password]);
  const passwordStrong = useMemo(() => isStrongPassword(password), [password]);

  const currentYear = new Date().getFullYear();
  const minStartYear = currentYear - PAST_YEARS_BACK;
  const maxStartYear = currentYear + FUTURE_YEARS_AHEAD;
  const endYearOptions = useMemo(() => getEndYearOptions(batchStart), [batchStart]);
  const courseDuration = useMemo(() => {
    const start = Number(batchStart);
    const end = Number(batchEnd);
    if (!start || !end || end <= start) return "";
    const years = end - start;
    return `${years} year${years === 1 ? "" : "s"}`;
  }, [batchStart, batchEnd]);

  const registerNumberError = useMemo(() => {
    if (!registerNumber) return "";
    if (!/^[0-9]+$/.test(registerNumber)) return "Only digits (0-9) are allowed.";
    if (registerNumber.length !== 6) return `Must be exactly 6 digits (${registerNumber.length}/6).`;
    return "";
  }, [registerNumber]);

  const mobileNumberError = useMemo(() => {
    if (!mobileNumber) return "";
    if (!/^[0-9]+$/.test(mobileNumber)) return "Only digits (0-9) are allowed.";
    if (mobileNumber.length !== 10) return `Must be exactly 10 digits (${mobileNumber.length}/10).`;
    return "";
  }, [mobileNumber]);

  const handleBatchStartChange = (value) => {
    setBatchStart(value);
    // Changing the start year invalidates any previously-picked end year,
    // since the valid end-year options are computed from the start year.
    setBatchEnd("");
  };

  const validate = () => {
    const errors = {};
    if (!username.trim()) {
      errors.username = "Username is required.";
    } else if (!/^[A-Za-z0-9._-]{3,30}$/.test(username.trim())) {
      errors.username = "3-30 characters: letters, numbers, dots, underscores or hyphens.";
    }
    if (!registerNumber) {
      errors.registerNumber = "Register number is required.";
    } else if (!/^[0-9]{6}$/.test(registerNumber)) {
      errors.registerNumber = "Must be exactly 6 digits.";
    }
    if (!mobileNumber) {
      errors.mobileNumber = "Mobile number is required.";
    } else if (!/^[0-9]{10}$/.test(mobileNumber)) {
      errors.mobileNumber = "Must be exactly 10 digits.";
    }
    if (!department) errors.department = "Please select your department.";
    if (!section) errors.section = "Please select your section.";
    if (!batchStart) errors.batchStart = "Please select your batch start year.";
    if (!batchEnd) errors.batchEnd = "Please select your batch end year.";
    if (!passwordStrong) {
      errors.password = "Password does not meet all requirements below.";
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordTouched(true);
    if (loading) return;
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await signUp({
        username: username.trim(),
        registerNumber,
        mobileNumber,
        password,
        confirmPassword,
        department,
        section,
        batch: `${batchStart}-${batchEnd}`,
      });
      push(`Welcome, ${data.student.username}! Your account is ready.`, "success");
      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Sign up failed. Please try again.", "error");
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
          <h1 className="mt-6 font-display text-xl font-semibold text-ink-100">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">Sign up to access your Coding Club Dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div>
              <label htmlFor="signup-username" className="field-label">
                Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. arjun_codes"
                  aria-invalid={Boolean(fieldErrors.username)}
                  className={textInputCls}
                />
              </div>
              {fieldErrors.username && <p className="mt-1.5 text-xs text-coral">{fieldErrors.username}</p>}
            </div>

            <div>
              <label htmlFor="signup-register" className="field-label">
                Register number
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-register"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  value={registerNumber}
                  onChange={(e) => setRegisterNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="6-digit register number"
                  aria-invalid={Boolean(fieldErrors.registerNumber || registerNumberError)}
                  className={textInputCls}
                />
              </div>
              {(fieldErrors.registerNumber || registerNumberError) && (
                <p className="mt-1.5 text-xs text-coral">{fieldErrors.registerNumber || registerNumberError}</p>
              )}
            </div>

            <div>
              <label htmlFor="signup-mobile" className="field-label">
                Mobile number
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-mobile"
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  aria-invalid={Boolean(fieldErrors.mobileNumber || mobileNumberError)}
                  className={textInputCls}
                />
              </div>
              {(fieldErrors.mobileNumber || mobileNumberError) && (
                <p className="mt-1.5 text-xs text-coral">{fieldErrors.mobileNumber || mobileNumberError}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-department" className="field-label">
                  Department
                </label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <select
                    id="signup-department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.department)}
                    className={selectCls}
                  >
                    <option value="">Select</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors.department && <p className="mt-1.5 text-xs text-coral">{fieldErrors.department}</p>}
              </div>

              <div>
                <label htmlFor="signup-section" className="field-label">
                  Section
                </label>
                <div className="relative">
                  <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <select
                    id="signup-section"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.section)}
                    className={selectCls}
                  >
                    <option value="">Select</option>
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors.section && <p className="mt-1.5 text-xs text-coral">{fieldErrors.section}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-batch-start" className="field-label">
                  Batch start year
                </label>
                <YearPicker
                  id="signup-batch-start"
                  value={batchStart}
                  onChange={handleBatchStartChange}
                  minYear={minStartYear}
                  maxYear={maxStartYear}
                  placeholder="Select year"
                  ariaInvalid={Boolean(fieldErrors.batchStart)}
                  className={`${textInputCls} pl-4`}
                />
                {fieldErrors.batchStart && <p className="mt-1.5 text-xs text-coral">{fieldErrors.batchStart}</p>}
              </div>

              <div>
                <label htmlFor="signup-batch-end" className="field-label">
                  Batch end year
                </label>
                <div className="relative">
                  <CalendarRange className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <select
                    id="signup-batch-end"
                    value={batchEnd}
                    onChange={(e) => setBatchEnd(e.target.value)}
                    disabled={!batchStart}
                    aria-invalid={Boolean(fieldErrors.batchEnd)}
                    className={`${selectCls} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <option value="">{batchStart ? "Select" : "Pick start year first"}</option>
                    {endYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors.batchEnd && <p className="mt-1.5 text-xs text-coral">{fieldErrors.batchEnd}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="signup-course-duration" className="field-label">
                Course duration
              </label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-course-duration"
                  type="text"
                  value={courseDuration}
                  disabled
                  readOnly
                  aria-readonly="true"
                  placeholder="Pick both batch years"
                  className={`${textInputCls} cursor-not-allowed opacity-60`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="signup-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordTouched(true)}
                  placeholder="Create a strong password"
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
              {passwordTouched && (
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {passwordRules.map((rule) => (
                    <li
                      key={rule.key}
                      className={`flex items-center gap-1.5 text-[11px] ${
                        rule.passed ? "text-mint" : "text-ink-500"
                      }`}
                    >
                      {rule.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {rule.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="signup-confirm" className="field-label">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  className="field-input py-3 pl-10 pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1.5 text-xs text-coral">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Creating account..." : "Sign up"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-500">
            Already have an account?{" "}
            <Link to="/signin" state={location.state} className="font-medium text-electric-light hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
