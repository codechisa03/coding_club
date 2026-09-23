const { queryDocs, allDocs, addDoc } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const memoryReads = new Set();
const ADMIN_KEY = "admin";

async function loadReadIds() {
  const { data } = await queryDocs("admin_notification_reads", [["admin_key", "==", ADMIN_KEY]]);
  if (!data) return memoryReads;
  return new Set([...memoryReads, ...(data || []).map((r) => r.notification_id)]);
}

async function persistReadIds(ids) {
  const clean = [...new Set(ids.map((id) => String(id)).filter(Boolean))].slice(0, 200);
  if (!clean.length) return 0;
  clean.forEach((id) => memoryReads.add(id));
  for (const id of clean) {
    await addDoc("admin_notification_reads", {
      admin_key: ADMIN_KEY,
      notification_id: id,
      read_at: new Date().toISOString(),
    }).catch(() => {});
  }
  return clean.length;
}

async function buildEvents() {
  const [{ data: recentAttempts, error: attemptsError }, { data: recentQuizzes, error: quizzesError }] =
    await Promise.all([
      queryDocs("quiz_attempts", [["status", "in", ["submitted", "auto_submitted"]]], {
        orderBy: "submitted_at",
        direction: "desc",
        limit: 25,
      }),
      queryDocs("quizzes", [], { orderBy: "created_at", direction: "desc", limit: 15 }),
    ]);

  if (attemptsError || quizzesError) {
    throw new ApiError(500, "Failed to load notifications", (attemptsError || quizzesError).message);
  }

  const { data: students } = await allDocs("students");
  const { data: quizzes } = await allDocs("quizzes");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));
  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));

  const events = [];

  (recentAttempts || []).forEach((a) => {
    if (!a.submitted_at) return;
    const student = studentById[a.student_id];
    const quiz = quizById[a.quiz_id];
    const pct = Math.round(Number(a.percentage) || 0);
    events.push({
      id: `attempt-${a.id}`,
      type: "submission",
      message: `${student?.name || "A student"} submitted "${quiz?.title || "a quiz"}" — ${pct}%${a.passed ? "" : " (below passing)"}`,
      timestamp: a.submitted_at,
    });
  });

  (recentQuizzes || []).forEach((q) => {
    events.push({
      id: `quiz-${q.id}`,
      type: "quiz",
      message: `Quiz "${q.title}" was created (${q.status})`,
      timestamp: q.created_at,
    });
  });

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, 30);
}

const listNotifications = asyncHandler(async (req, res) => {
  const [events, readIds] = await Promise.all([buildEvents(), loadReadIds()]);
  const notifications = events.map((e) => ({ ...e, read: readIds.has(e.id) }));
  res.json({ success: true, notifications, unreadCount: notifications.filter((n) => !n.read).length });
});

const markRead = asyncHandler(async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids : [];
  if (!ids.length) throw new ApiError(400, "ids must be a non-empty array");
  await persistReadIds(ids);
  const [events, readIds] = await Promise.all([buildEvents(), loadReadIds()]);
  res.json({ success: true, unreadCount: events.filter((e) => !readIds.has(e.id)).length });
});

const markAllRead = asyncHandler(async (req, res) => {
  const events = await buildEvents();
  await persistReadIds(events.map((e) => e.id));
  res.json({ success: true, unreadCount: 0 });
});

module.exports = { listNotifications, markRead, markAllRead };
