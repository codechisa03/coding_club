const { docById, queryDocs, allDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const liveSnapshot = asyncHandler(async (req, res) => {
  const { quizId } = req.params;

  const { data: quiz, error: quizError } = await docById("quizzes", quizId);
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");

  const { data: attendanceRows } = await queryDocs("attendance", [["quiz_id", "==", quizId]]);
  const { data: attempts } = await queryDocs("quiz_attempts", [["quiz_id", "==", quizId]], {
    orderBy: "obtained_marks",
    direction: "desc",
  });
  const { data: students } = await allDocs("students");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  const joined = attendanceRows?.length || 0;
  const active = (attempts || []).filter((a) => a.status === "in_progress").length;
  const submitted = (attempts || []).filter((a) => a.status === "submitted" || a.status === "auto_submitted").length;
  const notStarted = Math.max(0, joined - (attempts || []).length);

  res.json({
    success: true,
    quiz: { id: quiz.id, title: quiz.title, status: quiz.status },
    tiles: { online: joined, active, submitted, notStarted },
    ranking: (attempts || [])
      .filter((a) => a.status === "in_progress" || a.status === "submitted" || a.status === "auto_submitted")
      .map((a, idx) => {
        const student = studentById[a.student_id];
        return {
          rank: idx + 1,
          attemptId: a.id,
          studentId: student?.id,
          name: student?.name,
          registerNumber: student?.register_number,
          score: a.obtained_marks,
          violations: a.violations_count,
          status: a.status,
        };
      }),
  });
});

module.exports = { liveSnapshot };
