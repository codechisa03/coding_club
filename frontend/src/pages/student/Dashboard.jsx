import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  AlertTriangle,
  X,
  Trophy,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ListChecks,
  Eye,
  Loader2,
} from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { apiFetch, ApiError } from "../../lib/api";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { useToast } from "../../components/ui/Toast";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

// The Dashboard is deliberately scoped to Quizzes only — no username,
// register number, or "where to go next" navigation boxes. It shows the
// student's cumulative percentage across everything they've attended, the
// list of attended quizzes, and lets them drill into exactly what they
// submitted (including code) for any one of them.
export default function Dashboard() {
  const { token, signOut } = useStudentAccountAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [cumulativePercentage, setCumulativePercentage] = useState(null);
  const [logoutEvent, setLogoutEvent] = useState(null);
  const [logoutEventDismissed, setLogoutEventDismissed] = useState(false);

  const [activeAttemptId, setActiveAttemptId] = useState(null);
  const [attemptDetail, setAttemptDetail] = useState(null);
  const [attemptLoading, setAttemptLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch("/student/results", { token })
      .then((data) => {
        if (!alive) return;
        setResults(Array.isArray(data.results) ? data.results : []);
        setCumulativePercentage(
          typeof data.cumulativePercentage === "number" ? data.cumulativePercentage : null
        );
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          signOut();
          navigate("/signin", { replace: true });
          return;
        }
        if (alive) push(err instanceof ApiError ? err.message : "Failed to load your quizzes", "error");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    // Best-effort — a most-recent-quiz-logout note.
    let alive = true;
    apiFetch("/students/account/logout-events", { token })
      .then((data) => {
        if (alive && Array.isArray(data.events) && data.events.length) setLogoutEvent(data.events[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  const handleSignOut = () => {
    signOut();
    navigate("/", { replace: true });
  };

  const openAttempt = (attemptId) => {
    setActiveAttemptId(attemptId);
    setAttemptDetail(null);
    setAttemptLoading(true);
    apiFetch(`/student/results/${attemptId}`, { token })
      .then((data) => setAttemptDetail(data))
      .catch((err) => {
        push(err instanceof ApiError ? err.message : "Failed to load your submitted data", "error");
        setActiveAttemptId(null);
      })
      .finally(() => setAttemptLoading(false));
  };

  const closeAttempt = () => {
    setActiveAttemptId(null);
    setAttemptDetail(null);
  };

  const cumulativeColor =
    cumulativePercentage === null
      ? "text-ink-500"
      : cumulativePercentage >= 60
        ? "text-mint"
        : cumulativePercentage >= 40
          ? "text-amber"
          : "text-coral";
  const circumference = 2 * Math.PI * 52;
  const ringPct = Math.min(100, Math.max(0, cumulativePercentage || 0));

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-electric shadow-glow">
            <LayoutDashboard className="h-5 w-5 text-void" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-100">Your dashboard</h1>
            <p className="mt-1 text-sm text-ink-500">Every quiz you've attended, in one place.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-xl glass px-3.5 py-2 text-xs font-medium text-ink-500 transition-colors hover:text-coral"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {!loading && logoutEvent && !logoutEventDismissed && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm text-ink-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
          <div className="flex-1">
            <p className="font-medium">
              You were signed out of {logoutEvent.quizTitle ? `"${logoutEvent.quizTitle}"` : "a quiz"} during your
              last attempt.
            </p>
            <p className="mt-1 text-xs text-ink-500">{logoutEvent.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setLogoutEventDismissed(true)}
            className="shrink-0 text-ink-500 transition-colors hover:text-ink-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Cumulative percentage across every attended quiz */}
          <div className="mt-8 glass-card flex flex-col items-center gap-6 p-6 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                  {cumulativePercentage !== null && (
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="currentColor"
                      className={cumulativeColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - ringPct / 100)}
                      style={{ transition: "stroke-dashoffset 900ms ease" }}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`font-display text-xl font-semibold ${cumulativeColor}`}>
                    {cumulativePercentage === null ? "—" : `${cumulativePercentage}%`}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-500">Cumulative percentage</p>
                <p className="mt-1 text-sm text-ink-500">
                  {results.length === 0
                    ? "Attend a quiz to see your score here."
                    : `Average across ${results.length} attended ${results.length === 1 ? "quiz" : "quizzes"}.`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <MiniStat
                label="Quizzes"
                value={results.length}
                icon={ListChecks}
                tone="text-electric-light"
              />
              <MiniStat
                label="Passed"
                value={results.filter((r) => r.passed).length}
                icon={CheckCircle2}
                tone="text-mint"
              />
              <MiniStat
                label="Not passed"
                value={results.filter((r) => !r.passed).length}
                icon={XCircle}
                tone="text-coral"
              />
            </div>
          </div>

          {/* Attended quizzes */}
          <h2 className="mt-10 font-display text-lg font-semibold text-ink-100">Attended quizzes</h2>

          {results.length === 0 ? (
            <div className="mt-4 glass-card p-8 text-center text-sm text-ink-500">
              You haven't attended any quizzes yet. Once you join and submit one, it'll show up here.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {results.map((r) => (
                <div
                  key={r.attemptId}
                  className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-display text-sm font-semibold text-ink-100">
                        {r.quizTitle || "Untitled quiz"}
                      </p>
                      <Badge tone={r.passed ? "live" : "danger"}>{r.passed ? "Passed" : "Not passed"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">Submitted {formatDate(r.submittedAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-500">
                      <span>
                        {num(r.obtainedMarks)}/{num(r.totalMarks)} marks
                      </span>
                      <span>{Math.round(num(r.percentage))}%</span>
                      <span className="flex items-center gap-1 text-mint">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {num(r.correct)}
                      </span>
                      <span className="flex items-center gap-1 text-coral">
                        <XCircle className="h-3.5 w-3.5" /> {num(r.wrong)}
                      </span>
                      <span className="flex items-center gap-1 text-ink-500">
                        <MinusCircle className="h-3.5 w-3.5" /> {num(r.unanswered)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAttempt(r.attemptId)}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-electric/15 px-4 py-2.5 text-sm font-medium text-electric-light transition-colors hover:bg-electric/25"
                  >
                    <Eye className="h-4 w-4" /> View submission
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Attempt detail: exactly what the student saved/submitted, incl. code */}
      <Modal open={activeAttemptId !== null} title={attemptDetail?.attempt?.quizTitle || "Your submission"} onClose={closeAttempt} maxWidth="max-w-2xl">
        {attemptLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your submitted data...
          </div>
        ) : attemptDetail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat
                label="Score"
                value={`${num(attemptDetail.attempt?.obtainedMarks)}/${num(attemptDetail.attempt?.totalMarks)}`}
                icon={Trophy}
                tone="text-amber"
              />
              <MiniStat
                label="Percentage"
                value={`${Math.round(num(attemptDetail.attempt?.percentage))}%`}
                icon={ListChecks}
                tone="text-electric-light"
              />
              <MiniStat
                label="Result"
                value={attemptDetail.attempt?.passed ? "Passed" : "Not passed"}
                icon={attemptDetail.attempt?.passed ? CheckCircle2 : XCircle}
                tone={attemptDetail.attempt?.passed ? "text-mint" : "text-coral"}
              />
            </div>

            <div className="space-y-3">
              {(attemptDetail.questions || []).map((q) => (
                <div key={q.questionId} className="glass-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-100">Question {q.questionNumber}</p>
                    <Badge
                      tone={
                        q.outcome === "correct"
                          ? "live"
                          : q.outcome === "partial"
                            ? "violet"
                            : q.outcome === "unanswered"
                              ? "completed"
                              : "danger"
                      }
                    >
                      {q.outcome === "correct"
                        ? "Correct"
                        : q.outcome === "partial"
                          ? "Partially correct"
                          : q.outcome === "unanswered"
                            ? "Not answered"
                            : "Incorrect"}
                    </Badge>
                  </div>
                  {q.testsTotal ? (
                    <p className="mt-1 text-xs text-ink-500">
                      {q.testsPassed}/{q.testsTotal} test cases passed
                      {typeof q.marksAwarded === "number"
                        ? ` • ${q.marksAwarded} mark${q.marksAwarded === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-100">{q.question}</p>

                  {q.type === "coding" ? (
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-wide text-ink-600">
                        Your submitted code{q.language ? ` (${q.language})` : ""}
                      </p>
                      <pre className="mt-1.5 max-h-60 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-ink-100">
                        {q.yourCode || "Not answered"}
                      </pre>
                      {/* Only the hidden cases this attempt failed — hidden
                          cases it passed are never shown, even here. */}
                      {Array.isArray(q.hiddenCaseDetails) && q.hiddenCaseDetails.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-ink-600">Failed hidden test cases</p>
                          {q.hiddenCaseDetails.map((c, i) => (
                            <div key={i} className="rounded-lg border border-coral/20 bg-coral/5 p-2.5">
                              <p className="text-xs text-ink-200">{c.name}</p>
                              <div className="mt-1.5 grid gap-2 font-mono text-[11px] text-ink-300 sm:grid-cols-2">
                                <div>
                                  <p className="text-ink-600">Input</p>
                                  <pre className="whitespace-pre-wrap">{c.input}</pre>
                                </div>
                                <div>
                                  <p className="text-ink-600">Expected Output</p>
                                  <pre className="whitespace-pre-wrap">{c.expectedOutput}</pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-ink-500">
                        <span className="text-ink-700">Your answer: </span>
                        <span className="whitespace-pre-wrap text-ink-100">{q.yourAnswer || "Not answered"}</span>
                      </p>
                      {q.outcome !== "correct" && (
                        <p className="mt-1 text-sm text-ink-500">
                          <span className="text-ink-700">Correct answer: </span>
                          <span className="whitespace-pre-wrap text-mint">{q.correctAnswer || "—"}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function MiniStat({ label, value, tone = "text-ink-100", icon: Icon }) {
  return (
    <div className="glass-card px-3 py-3 text-center">
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className={`mt-1 font-display text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
