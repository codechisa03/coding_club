import { Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Code2,
  Trophy,
  Radio,
  ShieldCheck,
  Terminal,
  Users,
  LogIn,
  UserPlus,
  LayoutDashboard,
  Images,
} from "lucide-react";
import Logo from "../../components/Logo";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";

const FEATURES = [
  {
    icon: Trophy,
    title: "Live quizzes & assessments",
    body: "Join timed MCQ, fill-in-the-blank and coding quizzes with instant scoring and a live leaderboard.",
  },
  {
    icon: Terminal,
    title: "Programming practice",
    body: "Solve LeetCode/HackerRank-style problems in the built-in code editor with real compilers and hidden test cases.",
  },
  {
    icon: ShieldCheck,
    title: "Fair, proctored attempts",
    body: "Tab-switch detection, per-question timers and auto-submit keep every assessment fair for everyone.",
  },
  {
    icon: Radio,
    title: "Real-time results",
    body: "Scores, rankings and attendance update live, so you and your coordinators always see where things stand.",
  },
];

const STATS = [
  { label: "Languages supported", value: "C, C++, Java, Python & more" },
  { label: "Question types", value: "MCQ · Fill-in-the-blank · Coding" },
  { label: "Built for", value: "College coding clubs & classrooms" },
];

function ExploreMoreCTA() {
  return (
    <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Link
        to="/demo-quiz"
        className="glass-card group flex items-center justify-between gap-4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-glow"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-electric/10">
            <Sparkles className="h-5 w-5 text-electric" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-ink-100">Try the Demo Quiz</p>
            <p className="mt-0.5 text-xs text-ink-500">See live scoring and timers in action</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-1 group-hover:text-electric" />
      </Link>
      <Link
        to="/gallery"
        className="glass-card group flex items-center justify-between gap-4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-glow"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet/10">
            <Images className="h-5 w-5 text-violet" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-ink-100">Browse the Gallery</p>
            <p className="mt-0.5 text-xs text-ink-500">Photos and videos from Coding Club events</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-1 group-hover:text-violet" />
      </Link>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated, student } = useStudentAccountAuth();

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8 animate-fadeIn">
      {/* Hero */}
      <div className="glass-panel relative overflow-hidden p-8 sm:p-14">
        {/* Warm ambient blobs */}
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-electric/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-violet/10 blur-3xl" />
        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="mb-5">
              <Logo size="lg" />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-electric/10 px-3 py-1 text-[11px] font-semibold text-electric">
              <Sparkles className="h-3 w-3" /> College Coding Club
            </span>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-ink-100 sm:text-4xl lg:text-5xl">
              Learn to code. Compete live.{" "}
              <span className="text-electric">Prove it.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-500 sm:text-base">
              The Coding Club's home for quizzes, programming practice and assessments — join live
              quizzes with your class, sharpen your skills in the code editor, and track your rank on
              the leaderboard in real time.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-electric px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 hover:-translate-y-0.5"
                >
                  <LayoutDashboard className="h-4 w-4" /> Go to your Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-electric px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 hover:-translate-y-0.5"
                  >
                    <UserPlus className="h-4 w-4" /> Sign up free
                  </Link>
                  <Link
                    to="/signin"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold text-ink-100 shadow-card transition-all hover:border-electric/30 hover:-translate-y-0.5"
                  >
                    <LogIn className="h-4 w-4" /> Sign in
                  </Link>
                </>
              )}
              <Link
                to="/quizzes"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm font-medium text-ink-500 transition-colors hover:text-electric"
              >
                Browse quizzes <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isAuthenticated && student?.name && (
              <p className="mt-3 text-xs text-ink-500">Signed in as {student.name}</p>
            )}
          </div>

          {/* Stats panel */}
          <div className="glass-card w-full max-w-xs shrink-0 space-y-4 p-5">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-[11px] uppercase tracking-wide text-ink-500 font-semibold">{s.label}</p>
                <p className="mt-0.5 text-sm font-medium text-ink-100">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About */}
      <div className="mt-14 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-100">About the Coding Club</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            We're a student-run community for anyone who wants to get better at programming — from
            first-timers writing their first loop to seniors prepping for placement rounds. Through the
            year we run live quiz contests, hands-on programming practice and timed assessments, all in
            one place, with real-time results so you always know where you stand.
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm text-ink-500">
            <Users className="h-4 w-4 flex-none text-electric" />
            Open to every department, every year — no prior experience required.
          </div>
        </div>
        <div className="glass-card flex items-center justify-center p-8">
          <Code2 className="h-20 w-20 text-electric/40" strokeWidth={1.2} />
        </div>
      </div>

      {/* Features */}
      <h2 className="mt-16 mb-6 font-display text-2xl font-bold text-ink-100">What you get</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((f, i) => {
          const iconColors = ["text-electric", "text-violet", "text-mint", "text-amber"];
          const bgColors = ["bg-electric/10", "bg-violet/10", "bg-mint/10", "bg-amber/10"];
          return (
            <div key={f.title} className="glass-card flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:shadow-glow">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bgColors[i]}`}>
                <f.icon className={`h-5 w-5 ${iconColors[i]}`} strokeWidth={2} />
              </div>
              <p className="font-display text-sm font-semibold text-ink-100">{f.title}</p>
              <p className="text-xs leading-relaxed text-ink-500">{f.body}</p>
            </div>
          );
        })}
      </div>

      <ExploreMoreCTA />

      {/* CTA banner */}
      {!isAuthenticated && (
        <div className="glass-panel relative mt-16 overflow-hidden p-8 text-center sm:p-12">
          <div className="absolute inset-0 bg-gradient-to-r from-electric/8 via-transparent to-violet/8" />
          <div className="relative">
            <h2 className="font-display text-2xl font-bold text-ink-100">Ready to get started?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
              Create your account with your enrollment number to unlock your personal Dashboard.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-electric px-6 py-3 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 hover:-translate-y-0.5"
              >
                <UserPlus className="h-4 w-4" /> Create your account
              </Link>
              <Link
                to="/signin"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-ink-100 shadow-card transition-all hover:border-electric/30 hover:-translate-y-0.5"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
