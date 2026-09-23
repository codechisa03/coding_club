import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  MonitorX,
  RefreshCcw,
  Timer as TimerIcon,
  ListChecks,
  Send,
  Wifi,
  WifiOff,
  Loader2,
  EyeOff,
  BookOpenCheck,
  Rocket,
} from "lucide-react";
import Button from "./ui/Button";
import { useNetworkStabilityCheck } from "../hooks/useNetworkQuality";

const COUNTDOWN_SECONDS = 0;

// Static, frontend-only instruction content — no database / API involved.
const SLIDES = [
  {
    icon: Rocket,
    title: "You're all set",
    body: "Click the Start Quiz button below to begin. Good luck!",
  },
];

export default function QuizInstructions({ quizTitle, onStart }) {
  const [index, setIndex] = useState(0);
  const [maxSeen, setMaxSeen] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSecondsLeft(Math.max(0, COUNTDOWN_SECONDS - elapsed));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Network Quality Protection — a short connection check runs in the
  // background while the student reads the instructions, and "Start Quiz"
  // stays disabled until it comes back stable. Nothing else here changes:
  // this only adds one more condition alongside the existing slide/timer
  // gates below.
  const { checking: networkChecking, stable: networkStable, runCheck: runNetworkCheck } = useNetworkStabilityCheck();
  useEffect(() => {
    runNetworkCheck();
  }, [runNetworkCheck]);
  const networkReady = networkStable === true;

  const total = SLIDES.length;
  const allSeen = maxSeen >= total - 1;
  const timeDone = secondsLeft <= 0;
  const canStart = allSeen && timeDone && networkReady;

  const goNext = () => {
    setIndex((i) => {
      const next = Math.min(total - 1, i + 1);
      setMaxSeen((m) => Math.max(m, next));
      return next;
    });
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const slide = SLIDES[index];
  const Icon = slide.icon;
  const progress = useMemo(() => (COUNTDOWN_SECONDS === 0 ? 100 : ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100), [secondsLeft]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-10">
      <div className="glass-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Instructions</p>
            {quizTitle && <p className="truncate text-sm text-ink-300">{quizTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                networkChecking
                  ? "border-slate-200 bg-slate-50 text-ink-300"
                  : networkReady
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : "border-coral/30 bg-coral/10 text-coral"
              }`}
              title="Network Quality Protection — checked before the quiz can start"
            >
              {networkChecking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : networkReady ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              <span className="text-xs font-medium">
                {networkChecking ? "Checking connection…" : networkReady ? "Connection stable" : "Connection unstable"}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <TimerIcon className="h-4 w-4 text-electric" />
              <span className="text-sm font-semibold tabular-nums text-ink-100">
                {timeDone ? "Ready" : `${secondsLeft}s`}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-electric transition-all duration-300 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div key={index} className="mt-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-electric/30 bg-electric/10">
            <Icon className="h-7 w-7 text-electric" strokeWidth={2} />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink-100">{slide.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-300">{slide.body}</p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? "w-6 bg-electric" : i <= maxSeen ? "w-1.5 bg-electric/40" : "w-1.5 bg-white"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={index === 0} onClick={goPrev}>
            Previous
          </Button>
          <p className="text-xs text-ink-500">
            Slide {index + 1} of {total}
          </p>
          {index < total - 1 ? (
            <Button size="sm" onClick={goNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} disabled={!canStart}>
              Start Quiz
            </Button>
          )}
        </div>

        {!canStart && (
          <div className="mt-4 text-center text-xs text-ink-500">
            <p>
              {!allSeen
                ? "View all instruction slides to unlock the Start Quiz button."
                : !timeDone
                  ? `Please wait ${secondsLeft}s before starting.`
                  : networkChecking
                    ? "Checking your connection before starting…"
                    : "Your connection looks unstable right now — starting is disabled until it's stable."}
            </p>
            {allSeen && timeDone && !networkReady && !networkChecking && (
              <button
                type="button"
                onClick={() => runNetworkCheck()}
                className="mt-2 font-medium text-electric underline underline-offset-2"
              >
                Retry connection check
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
