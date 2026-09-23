const { queryDocs, allDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const getLeaderboard = asyncHandler(async (req, res) => {
  const { data: attempts, error } = await queryDocs("quiz_attempts", [
    ["status", "in", ["submitted", "auto_submitted"]],
  ]);
  if (error) throw new ApiError(500, "Failed to load leaderboard", error.message);

  const { data: students } = await allDocs("students");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  const byStudent = new Map();
  (attempts || []).forEach((a) => {
    const student = studentById[a.student_id];
    if (!student) return;
    if (!byStudent.has(student.id)) {
      byStudent.set(student.id, {
        studentId: student.id,
        name: student.name,
        registerNumber: student.register_number,
        department: student.department,
        year: student.year,
        section: student.section,
        isGuest: !student.username,
        attemptsCount: 0,
        percentageSum: 0,
        lastSubmittedAt: null,
      });
    }
    const entry = byStudent.get(student.id);
    entry.attemptsCount += 1;
    entry.percentageSum += Number(a.percentage) || 0;
    if (!entry.lastSubmittedAt || (a.submitted_at && a.submitted_at > entry.lastSubmittedAt)) {
      entry.lastSubmittedAt = a.submitted_at;
    }
  });

  const rows = [...byStudent.values()].map((e) => ({
    studentId: e.studentId,
    name: e.name,
    registerNumber: e.registerNumber,
    department: e.department,
    year: e.year,
    section: e.section,
    quizzesAttended: e.attemptsCount,
    cumulativePercentage: e.attemptsCount ? Math.round((e.percentageSum / e.attemptsCount) * 100) / 100 : 0,
    lastSubmittedAt: e.lastSubmittedAt,
  }));

  const rank = (list) =>
    [...list]
      .sort((a, b) =>
        b.cumulativePercentage - a.cumulativePercentage ||
        b.quizzesAttended - a.quizzesAttended ||
        String(a.name || "").localeCompare(String(b.name || ""))
      )
      .map((row, i) => ({ ...row, rank: i + 1 }));

  const registeredIds = new Set(
    [...byStudent.values()].filter((e) => !e.isGuest).map((e) => e.studentId)
  );

  res.json({
    success: true,
    leaderboard: rank(rows.filter((r) => registeredIds.has(r.studentId))),
    guests: rank(rows.filter((r) => !registeredIds.has(r.studentId))),
  });
});

module.exports = { getLeaderboard };
