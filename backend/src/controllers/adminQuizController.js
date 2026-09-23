const bcrypt = require("bcryptjs");
const {
  docById,
  queryDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  countDocs,
  allDocs,
} = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

function normalizePlacement(value) {
  return value === "landing" ? "landing" : "quizzes";
}

function quizPublicShape(q) {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    durationMinutes: q.duration_minutes,
    startTime: q.start_time,
    endTime: q.end_time,
    maxMarks: q.max_marks,
    passingPercentage: q.passing_percentage,
    maxAttempts: q.max_attempts,
    randomizeQuestions: q.randomize_questions,
    randomizeOptions: q.randomize_options,
    autoSubmit: q.auto_submit,
    allowLateJoin: q.allow_late_join,
    showLeaderboard: q.show_leaderboard,
    tabSwitchLimit: q.tab_switch_limit,
    status: q.status,
    placement: q.placement || "quizzes",
    createdAt: q.created_at,
    updatedAt: q.updated_at,
  };
}

function validateQuizPayload(body, { requirePassword, requireTitle }) {
  const errors = [];
  if (requireTitle) {
    if (!body.title || !String(body.title).trim()) errors.push("title is required");
  } else if (body.title !== undefined && !String(body.title).trim()) {
    errors.push("title cannot be empty");
  }
  if (requirePassword && !body.password) errors.push("password is required");
  if (body.durationMinutes !== undefined && Number(body.durationMinutes) <= 0) errors.push("durationMinutes must be greater than 0");
  if (body.maxMarks !== undefined && Number(body.maxMarks) < 0) errors.push("maxMarks cannot be negative");
  if (body.status !== undefined && !["draft", "upcoming", "live", "completed"].includes(body.status)) errors.push("status must be one of draft, upcoming, live, completed");
  if (errors.length) throw new ApiError(400, "Validation failed", errors);
}

// GET /api/admin/quizzes?placement=quizzes|landing
const listQuizzes = asyncHandler(async (req, res) => {
  const placement = normalizePlacement(req.query.placement);
  const { data: quizzes, error } = await queryDocs("quizzes", [["placement", "==", placement]], { orderBy: "created_at", direction: "desc" });
  if (error) throw new ApiError(500, "Failed to load quizzes", error.message);

  const { data: questionRows } = await allDocs("questions");
  const { data: attemptRows } = await allDocs("quiz_attempts");

  const qCountMap = {};
  (questionRows || []).forEach((r) => (qCountMap[r.quiz_id] = (qCountMap[r.quiz_id] || 0) + 1));
  const aCountMap = {};
  (attemptRows || []).forEach((r) => (aCountMap[r.quiz_id] = (aCountMap[r.quiz_id] || 0) + 1));

  res.json({
    success: true,
    quizzes: (quizzes || []).map((q) => ({
      ...quizPublicShape(q),
      questionCount: qCountMap[q.id] || 0,
      participantCount: aCountMap[q.id] || 0,
    })),
  });
});

const getQuiz = asyncHandler(async (req, res) => {
  const { data: quiz, error } = await docById("quizzes", req.params.id);
  if (error) throw new ApiError(500, "Failed to load quiz", error.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  res.json({ success: true, quiz: quizPublicShape(quiz) });
});

const createQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};
  validateQuizPayload(body, { requirePassword: true, requireTitle: true });

  const row = {
    title: String(body.title).trim(),
    description: body.description || "",
    password_hash: bcrypt.hashSync(String(body.password), 10),
    duration_minutes: Number(body.durationMinutes) || 30,
    start_time: body.startTime || null,
    end_time: body.endTime || null,
    max_marks: Number(body.maxMarks) || 0,
    passing_percentage: Number(body.passingPercentage ?? 40),
    max_attempts: Number(body.maxAttempts ?? 1),
    randomize_questions: body.randomizeQuestions ?? true,
    randomize_options: body.randomizeOptions ?? true,
    auto_submit: body.autoSubmit ?? true,
    allow_late_join: body.allowLateJoin ?? false,
    show_leaderboard: body.showLeaderboard ?? true,
    tab_switch_limit: Number(body.tabSwitchLimit ?? 3),
    status: body.status || "draft",
    placement: normalizePlacement(body.placement),
  };

  const { data: quiz, error } = await addDoc("quizzes", row);
  if (error) {
    console.error("Supabase addDoc Error (createQuiz):", error);
    throw new ApiError(500, "Failed to create quiz: " + error.message, error.message);
  }
  res.status(201).json({ success: true, quiz: quizPublicShape(quiz) });
});

const updateQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};
  validateQuizPayload(body, { requirePassword: false, requireTitle: false });

  const row = {
    ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.password ? { password_hash: bcrypt.hashSync(String(body.password), 10) } : {}),
    ...(body.durationMinutes !== undefined ? { duration_minutes: Number(body.durationMinutes) } : {}),
    ...(body.startTime !== undefined ? { start_time: body.startTime || null } : {}),
    ...(body.endTime !== undefined ? { end_time: body.endTime || null } : {}),
    ...(body.maxMarks !== undefined ? { max_marks: Number(body.maxMarks) } : {}),
    ...(body.passingPercentage !== undefined ? { passing_percentage: Number(body.passingPercentage) } : {}),
    ...(body.maxAttempts !== undefined ? { max_attempts: Number(body.maxAttempts) } : {}),
    ...(body.randomizeQuestions !== undefined ? { randomize_questions: body.randomizeQuestions } : {}),
    ...(body.randomizeOptions !== undefined ? { randomize_options: body.randomizeOptions } : {}),
    ...(body.autoSubmit !== undefined ? { auto_submit: body.autoSubmit } : {}),
    ...(body.allowLateJoin !== undefined ? { allow_late_join: body.allowLateJoin } : {}),
    ...(body.showLeaderboard !== undefined ? { show_leaderboard: body.showLeaderboard } : {}),
    ...(body.tabSwitchLimit !== undefined ? { tab_switch_limit: Number(body.tabSwitchLimit) } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.placement !== undefined ? { placement: normalizePlacement(body.placement) } : {}),
  };

  const { error } = await updateDoc("quizzes", req.params.id, row);
  if (error) throw new ApiError(500, "Failed to update quiz", error.message);
  const { data: quiz } = await docById("quizzes", req.params.id);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  res.json({ success: true, quiz: quizPublicShape(quiz) });
});

const deleteQuiz = asyncHandler(async (req, res) => {
  const { error } = await deleteDoc("quizzes", req.params.id);
  if (error) throw new ApiError(500, "Failed to delete quiz", error.message);
  res.json({ success: true, message: "Quiz deleted" });
});

const setPublishStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!["draft", "upcoming", "live", "completed"].includes(status)) {
    throw new ApiError(400, "status must be one of draft, upcoming, live, completed");
  }
  const { error } = await updateDoc("quizzes", req.params.id, { status });
  if (error) throw new ApiError(500, "Failed to update quiz status", error.message);
  const { data: quiz } = await docById("quizzes", req.params.id);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  res.json({ success: true, quiz: quizPublicShape(quiz) });
});

const dashboardStats = asyncHandler(async (req, res) => {
  const [{ data: quizzes }, { data: students }, { data: attempts }, { data: attendanceRows }] = await Promise.all([
    allDocs("quizzes"),
    allDocs("students"),
    queryDocs("quiz_attempts", [], { orderBy: "submitted_at", direction: "desc" }),
    allDocs("attendance"),
  ]);

  const totalQuizzes = (quizzes || []).length;
  const activeQuizzes = (quizzes || []).filter((q) => q.status === "live").length;
  const completedQuizzes = (quizzes || []).filter((q) => q.status === "completed").length;
  const totalStudents = (students || []).length;

  const submitted = (attempts || []).filter((a) => a.status === "submitted" || a.status === "auto_submitted");
  const totalParticipants = (attempts || []).length;
  const avgScore = submitted.length > 0 ? submitted.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0) / submitted.length : 0;

  const present = (attendanceRows || []).filter((a) => a.status === "present").length;
  const absent = (attendanceRows || []).filter((a) => a.status === "absent").length;

  const quizTitleById = Object.fromEntries((quizzes || []).map((q) => [q.id, q.title]));
  const studentNameById = Object.fromEntries((students || []).map((s) => [s.id, s.name]));

  const recentActivity = submitted.slice(0, 8).map((a) => ({
    name: studentNameById[a.student_id] || "Unknown",
    quiz: quizTitleById[a.quiz_id] || "Quiz",
    score: a.obtained_marks,
    submittedAt: a.submitted_at,
  }));

  res.json({
    success: true,
    stats: { totalStudents, totalQuizzes, activeQuizzes, completedQuizzes, totalParticipants, present, absent, averageScore: Math.round(avgScore * 10) / 10 },
    recentActivity,
  });
});

module.exports = { listQuizzes, getQuiz, createQuiz, updateQuiz, deleteQuiz, setPublishStatus, dashboardStats };
