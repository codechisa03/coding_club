const { docById, queryDocs, allDocs, deleteDoc, deleteDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const listParticipants = asyncHandler(async (req, res) => {
  const { quizId, department, year, section, search } = req.query;

  const filters = [];
  if (quizId) filters.push(["quiz_id", "==", quizId]);

  const { data: attendanceRows, error } = await queryDocs("attendance", filters, {
    orderBy: "join_time",
    direction: "desc",
  });
  if (error) throw new ApiError(500, "Failed to load participants", error.message);

  const { data: students } = await allDocs("students");
  const { data: quizzes } = await allDocs("quizzes");
  const { data: attempts } = quizId
    ? await queryDocs("quiz_attempts", [["quiz_id", "==", quizId]])
    : await allDocs("quiz_attempts");

  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));
  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));
  const attemptByStudent = new Map();
  (attempts || []).forEach((a) => {
    if (!attemptByStudent.has(a.student_id)) attemptByStudent.set(a.student_id, a);
  });

  let rows = (attendanceRows || []).map((r) => {
    const student = studentById[r.student_id];
    const quiz = quizById[r.quiz_id];
    const attempt = attemptByStudent.get(r.student_id);
    return {
      attendanceId: r.id,
      quiz: quiz ? { id: quiz.id, title: quiz.title } : null,
      student: student ? { id: student.id, name: student.name, register_number: student.register_number, email: student.email, department: student.department, year: student.year, section: student.section } : null,
      loginStatus: "logged_in",
      attendanceStatus: r.status,
      completed: r.completed,
      joinTime: r.join_time,
      quizStartTime: r.quiz_start_time,
      submissionTime: r.submission_time,
      score: attempt?.obtained_marks ?? null,
      attemptStatus: attempt?.status ?? "not_started",
    };
  });

  if (department) rows = rows.filter((r) => r.student?.department === department);
  if (year) rows = rows.filter((r) => r.student?.year === year);
  if (section) rows = rows.filter((r) => r.student?.section === section);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student?.name?.toLowerCase().includes(q) ||
        r.student?.register_number?.toLowerCase().includes(q) ||
        r.student?.email?.toLowerCase().includes(q)
    );
  }

  res.json({ success: true, participants: rows });
});

const listQuizParticipation = asyncHandler(async (req, res) => {
  const { quizId } = req.params;
  if (!quizId) throw new ApiError(400, "Quiz id is required");

  const { data: quiz, error: quizError } = await docById("quizzes", quizId);
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");

  const [{ data: attendanceRows }, { data: attempts }] = await Promise.all([
    queryDocs("attendance", [["quiz_id", "==", quizId]], { orderBy: "join_time", direction: "desc" }),
    queryDocs("quiz_attempts", [["quiz_id", "==", quizId]], { orderBy: "attempt_number", direction: "asc" }),
  ]);

  const { data: students } = await allDocs("students");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  const attemptByStudent = new Map();
  (attempts || []).forEach((a) => {
    if (a.student_id != null) attemptByStudent.set(String(a.student_id), a);
  });

  const seenStudents = new Set();
  const participants = (attendanceRows || []).map((r) => {
    const student = studentById[r.student_id] || {};
    const attempt = attemptByStudent.get(String(r.student_id));
    if (r.student_id != null) seenStudents.add(String(r.student_id));
    return {
      id: r.id,
      source: "attendance",
      quizId: quiz.id,
      quizTitle: quiz.title,
      studentId: student.id ?? null,
      name: student.name ?? "Unknown",
      registerNumber: student.register_number ?? null,
      email: student.email ?? null,
      department: student.department ?? null,
      year: student.year ?? null,
      section: student.section ?? null,
      participatedAt: r.join_time ?? attempt?.started_at ?? null,
      quizStartTime: r.quiz_start_time,
      submissionTime: r.submission_time ?? attempt?.submitted_at ?? null,
      attendanceStatus: r.status,
      completed: r.completed,
      score: attempt?.obtained_marks ?? null,
      totalMarks: attempt?.total_marks ?? null,
      percentage: attempt?.percentage ?? null,
      attemptStatus: attempt?.status ?? "not_started",
    };
  });

  (attempts || []).forEach((a) => {
    const student = studentById[a.student_id] || {};
    if (a.student_id != null && seenStudents.has(String(a.student_id))) return;
    participants.push({
      id: `attempt:${a.id}`,
      source: "attempt",
      quizId: quiz.id,
      quizTitle: quiz.title,
      studentId: student.id ?? a.student_id ?? null,
      name: student.name ?? "Unknown",
      registerNumber: student.register_number ?? null,
      email: student.email ?? null,
      department: student.department ?? null,
      year: student.year ?? null,
      section: student.section ?? null,
      participatedAt: a.started_at ?? null,
      quizStartTime: a.started_at ?? null,
      submissionTime: a.submitted_at ?? null,
      attendanceStatus: a.status ?? null,
      completed: a.status === "submitted" || a.status === "auto_submitted",
      score: a.obtained_marks ?? null,
      totalMarks: a.total_marks ?? null,
      percentage: a.percentage ?? null,
      attemptStatus: a.status ?? "not_started",
    });
  });

  participants.sort((x, y) => new Date(y.participatedAt || 0) - new Date(x.participatedAt || 0));

  res.json({ success: true, quiz: { id: quiz.id, title: quiz.title }, total: participants.length, participants });
});

const deleteQuizParticipation = asyncHandler(async (req, res) => {
  const { quizId, id } = req.params;
  if (!quizId || !id) throw new ApiError(400, "Quiz id and participation id are required");

  if (String(id).startsWith("attempt:")) {
    const attemptId = String(id).slice("attempt:".length);
    const { data: attempt, error: attemptFindError } = await docById("quiz_attempts", attemptId);
    if (attemptFindError) throw new ApiError(500, "Failed to load participation record", attemptFindError.message);
    if (!attempt) throw new ApiError(404, "Participation record not found or already deleted");
    if (String(attempt.quiz_id) !== String(quizId)) throw new ApiError(400, "This participation record does not belong to the selected quiz");
    await deleteDoc("quiz_attempts", attemptId);
    return res.json({ success: true, deletedId: id });
  }

  const { data: existing, error: findError } = await docById("attendance", id);
  if (findError) throw new ApiError(500, "Failed to load participation record", findError.message);
  if (!existing) throw new ApiError(404, "Participation record not found or already deleted");
  if (String(existing.quiz_id) !== String(quizId)) throw new ApiError(400, "This participation record does not belong to the selected quiz");

  await deleteDoc("attendance", id);
  res.json({ success: true, deletedId: id });
});

module.exports = { listParticipants, listQuizParticipation, deleteQuizParticipation };
