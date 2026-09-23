const { docById, queryDocs, allDocs, deleteDoc, deleteDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

// GET /api/admin/students?search=...&limit=...&accountType=registered|guest
const searchStudents = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 500) : 50;
  const accountType = String(req.query.accountType || "").trim().toLowerCase();

  const { data: allStudents, error } = await allDocs("students", { orderBy: "created_at", direction: "desc" });
  if (error) throw new ApiError(500, "Failed to search students", error.message);

  let filtered = allStudents || [];

  if (accountType === "registered") {
    filtered = filtered.filter((s) => Boolean(s.username));
  } else if (accountType === "guest") {
    filtered = filtered.filter((s) => !s.username);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        String(s.name || "").toLowerCase().includes(q) ||
        String(s.register_number || "").toLowerCase().includes(q)
    );
  }

  res.json({
    success: true,
    students: filtered.slice(0, limit).map((s) => ({
      id: s.id,
      name: s.name,
      registerNumber: s.register_number,
      username: s.username,
      email: s.email,
      mobileNumber: s.mobile_number,
      department: s.department,
      year: s.year,
      section: s.section,
      batch: s.batch ?? null,
      createdAt: s.created_at,
    })),
  });
});

// GET /api/admin/students/:id
const getStudentDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data: student, error: studentError } = await docById("students", id);
  if (studentError) throw new ApiError(500, "Failed to load student", studentError.message);
  if (!student) throw new ApiError(404, "Student not found");

  const [{ data: attempts }, { data: quizzes }, { data: attendanceRows }, { data: logoutEvents }] = await Promise.all([
    queryDocs("quiz_attempts", [["student_id", "==", id]], { orderBy: "started_at", direction: "desc" }),
    allDocs("quizzes"),
    queryDocs("attendance", [["student_id", "==", id]], { orderBy: "join_time", direction: "desc" }),
    queryDocs("student_logout_events", [["student_id", "==", id]], { orderBy: "created_at", direction: "desc", limit: 20 }),
  ]);

  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));
  const attemptList = attempts || [];
  const attemptIds = attemptList.map((a) => a.id);

  let programs = [];
  if (attemptIds.length > 0) {
    const { data: answers } = await queryDocs("answers", [["attempt_id", "in", attemptIds]]);
    const { data: questions } = await allDocs("questions");
    const questionById = Object.fromEntries((questions || []).map((q) => [q.id, q]));

    programs = (answers || [])
      .filter((a) => questionById[a.question_id]?.question_type === "coding")
      .map((a) => {
        const attempt = attemptList.find((att) => att.id === a.attempt_id);
        const quiz = attempt ? quizById[attempt.quiz_id] : null;
        const question = questionById[a.question_id];
        return {
          id: a.id,
          quizTitle: quiz?.title || "Untitled quiz",
          questionText: question?.question_text || "",
          language: a.language || null,
          verdict: a.judge_result?.status || null,
          testsPassed: a.judge_result?.passed ?? null,
          testsTotal: a.judge_result?.total ?? null,
          marksAwarded: a.marks_awarded,
          answeredAt: a.answered_at,
        };
      })
      .sort((a, b) => new Date(b.answeredAt || 0) - new Date(a.answeredAt || 0));
  }

  const gradedAttempts = attemptList.filter((a) => a.total_marks !== null && a.total_marks !== undefined && a.total_marks > 0);
  const sumObtained = gradedAttempts.reduce((sum, a) => sum + (Number(a.obtained_marks) || 0), 0);
  const sumTotal = gradedAttempts.reduce((sum, a) => sum + (Number(a.total_marks) || 0), 0);
  const cumulativePercentage = sumTotal > 0 ? Math.round((sumObtained / sumTotal) * 10000) / 100 : null;

  res.json({
    success: true,
    student: {
      id: student.id,
      name: student.name,
      registerNumber: student.register_number,
      username: student.username,
      email: student.email,
      mobileNumber: student.mobile_number,
      department: student.department,
      year: student.year,
      section: student.section,
      batch: student.batch ?? null,
      bio: student.bio ?? null,
      createdAt: student.created_at,
      cumulativePercentage,
    },
    summary: {
      quizzesAttempted: attemptList.length,
      programsAttempted: programs.length,
      attendanceRecorded: (attendanceRows || []).length,
    },
    attempts: attemptList.map((a) => ({
      id: a.id,
      quizId: a.quiz_id,
      quizTitle: quizById[a.quiz_id]?.title || "Untitled quiz",
      status: a.status,
      attemptNumber: a.attempt_number,
      obtainedMarks: a.obtained_marks,
      totalMarks: a.total_marks,
      percentage: a.percentage,
      passed: a.passed,
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
    })),
    programs,
    attendance: (attendanceRows || []).map((r) => ({
      id: r.id,
      quizId: r.quiz_id,
      quizTitle: quizById[r.quiz_id]?.title || "Untitled quiz",
      status: r.status,
      completed: r.completed,
      joinTime: r.join_time,
      quizStartTime: r.quiz_start_time,
      submissionTime: r.submission_time,
    })),
    activity: (logoutEvents || []).map((e) => ({
      id: e.id,
      quizTitle: e.quiz_title || "",
      reason: e.reason,
      message: e.message,
      createdAt: e.created_at,
    })),
  });
});

// DELETE /api/admin/students/:id
const deleteStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) throw new ApiError(400, "Student id is required");

  const { data: student, error: findError } = await docById("students", id);
  if (findError) throw new ApiError(500, "Failed to load student", findError.message);
  if (!student) throw new ApiError(404, "Student not found or already deleted");

  const { data: attempts } = await queryDocs("quiz_attempts", [["student_id", "==", id]]);
  for (const att of (attempts || [])) {
    await deleteDocs("answers", [["attempt_id", "==", att.id]]);
  }
  await deleteDocs("quiz_attempts", [["student_id", "==", id]]);
  await deleteDocs("attendance", [["student_id", "==", id]]);
  await deleteDocs("student_logout_events", [["student_id", "==", id]]);
  await deleteDoc("students", id);

  res.json({ success: true, message: `Deleted account for ${student.name} (${student.register_number})` });
});

module.exports = { searchStudents, getStudentDetail, deleteStudent };
