const { queryDocs, allDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const listAttendance = asyncHandler(async (req, res) => {
  const { quizId, department, year, status, date } = req.query;

  const filters = [];
  if (quizId) filters.push(["quiz_id", "==", quizId]);
  if (status) filters.push(["status", "==", status]);

  const { data: attendanceRows, error } = await queryDocs("attendance", filters, {
    orderBy: "join_time",
    direction: "desc",
  });
  if (error) throw new ApiError(500, "Failed to load attendance", error.message);

  // Load related quizzes and students
  const { data: quizzes } = await allDocs("quizzes");
  const { data: students } = await allDocs("students");
  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  let rows = (attendanceRows || []).map((r) => {
    const quiz = quizById[r.quiz_id];
    const student = studentById[r.student_id];
    return {
      id: r.id,
      quiz: quiz ? { id: quiz.id, title: quiz.title } : null,
      student: student ? { id: student.id, name: student.name, register_number: student.register_number, department: student.department, year: student.year, section: student.section } : null,
      status: r.status,
      completed: r.completed,
      joinTime: r.join_time,
      quizStartTime: r.quiz_start_time,
      submissionTime: r.submission_time,
    };
  });

  if (department) rows = rows.filter((r) => r.student?.department === department);
  if (year) rows = rows.filter((r) => r.student?.year === year);
  if (date) rows = rows.filter((r) => r.joinTime && r.joinTime.slice(0, 10) === date);

  res.json({ success: true, attendance: rows });
});

module.exports = { listAttendance };
