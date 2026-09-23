const { queryDocs, allDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const listLogoutEvents = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

  const { data: rows, error } = await queryDocs(
    "student_logout_events",
    [],
    { orderBy: "created_at", direction: "desc", limit: 500 }
  );
  if (error) throw new ApiError(500, "Failed to load security log", error.message);

  const { data: students } = await allDocs("students");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  const q = search.toLowerCase();
  const filtered = (rows || []).filter((r) => {
    if (!q) return true;
    const student = studentById[r.student_id];
    const name = String(student?.name || "").toLowerCase();
    const registerNumber = String(student?.register_number || "").toLowerCase();
    const quizTitle = String(r.quiz_title || "").toLowerCase();
    const reason = String(r.reason || "").toLowerCase();
    return name.includes(q) || registerNumber.includes(q) || quizTitle.includes(q) || reason.includes(q);
  });

  res.json({
    success: true,
    total: filtered.length,
    events: filtered.slice(0, limit).map((e) => {
      const student = studentById[e.student_id];
      return {
        id: e.id,
        studentId: student?.id || null,
        studentName: student?.name || "Unknown student",
        registerNumber: student?.register_number || "",
        quizId: e.quiz_id,
        quizTitle: e.quiz_title || "Untitled quiz",
        reason: e.reason,
        message: e.message,
        details: e.details || null,
        createdAt: e.created_at,
      };
    }),
  });
});

module.exports = { listLogoutEvents };
