const { docById, queryDocs, addDoc, updateDoc, deleteDoc, deleteDocs, countDocs, allDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { rankAttempts } = require("../utils/ranking");

function resultRow(a, quizTitle, student) {
  return {
    attemptId: a.id,
    rank: a.__rank ?? null,
    quiz: a._quiz || null,
    student: a._student || null,
    status: a.status,
    totalMarks: a.total_marks,
    obtainedMarks: a.obtained_marks,
    percentage: a.percentage,
    correct: a.correct_count,
    wrong: a.wrong_count,
    unanswered: a.unanswered_count,
    passed: a.passed,
    violations: a.violations_count,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    totalQuestions: Number(a.correct_count || 0) + Number(a.wrong_count || 0) + Number(a.unanswered_count || 0),
    timeTakenSeconds: a.submitted_at && a.started_at ? Math.max(0, Math.round((new Date(a.submitted_at) - new Date(a.started_at)) / 1000)) : null,
  };
}

function rankPerQuiz(attempts) {
  const groups = new Map();
  attempts.forEach((a) => {
    const key = a.quiz_id || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });
  return [...groups.values()].flatMap((rows) => rankAttempts(rows));
}

const listResults = asyncHandler(async (req, res) => {
  const { quizId } = req.query;
  const filters = [["status", "in", ["submitted", "auto_submitted"]]];
  if (quizId) filters.push(["quiz_id", "==", quizId]);

  const { data: attempts, error } = await queryDocs("quiz_attempts", filters);
  if (error) throw new ApiError(500, "Failed to load results", error.message);

  const { data: students } = await allDocs("students");
  const { data: quizzes } = await allDocs("quizzes");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));
  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));

  const enriched = (attempts || []).map((a) => ({
    ...a,
    _quiz: quizById[a.quiz_id] ? { id: quizById[a.quiz_id].id, title: quizById[a.quiz_id].title } : null,
    _student: studentById[a.student_id] || null,
  }));

  const results = rankPerQuiz(enriched).map((a) => resultRow(a));
  const scores = results.map((r) => Number(r.percentage) || 0);
  const summary = {
    count: results.length,
    highestScore: scores.length ? Math.max(...scores) : 0,
    averageScore: scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : 0,
    passCount: results.filter((r) => r.passed).length,
    failCount: results.filter((r) => !r.passed).length,
    passPercentage: results.length ? Math.round((results.filter((r) => r.passed).length / results.length) * 1000) / 10 : 0,
  };

  res.json({ success: true, results, summary });
});

const getResultDetail = asyncHandler(async (req, res) => {
  const { data: attempt, error } = await docById("quiz_attempts", req.params.attemptId);
  if (error) throw new ApiError(500, "Failed to load result", error.message);
  if (!attempt) throw new ApiError(404, "Result not found");

  const [{ data: answers }, { data: allQuestions }, { data: students }, { data: quizzes }] = await Promise.all([
    queryDocs("answers", [["attempt_id", "==", attempt.id]]),
    queryDocs("questions", [["quiz_id", "==", attempt.quiz_id]], { orderBy: "order_index", direction: "asc" }),
    allDocs("students"),
    allDocs("quizzes"),
  ]);

  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));
  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));
  const answerByQuestion = Object.fromEntries((answers || []).map((a) => [a.question_id, a]));

  // Load options for each question
  const { data: allOptions } = await queryDocs("quiz_options", [["quiz_id", "==", attempt.quiz_id]]);
  const optionsByQuestion = {};
  (allOptions || []).forEach((o) => {
    if (!optionsByQuestion[o.question_id]) optionsByQuestion[o.question_id] = [];
    optionsByQuestion[o.question_id].push(o);
  });

  const questionBreakdown = (allQuestions || []).map((q) => {
    const ans = answerByQuestion[q.id];
    const type = q.question_type || "mcq";
    const options = optionsByQuestion[q.id] || [];

    if (type === "coding") {
      const marksAwarded = Number(ans?.marks_awarded ?? 0);
      return {
        questionId: q.id,
        type: "coding",
        text: q.question_text,
        marks: q.marks,
        language: ans?.language || q.language,
        submittedCode: ans?.code_answer ?? null,
        problemStatement: q.problem_statement ?? null,
        expectedOutput: q.expected_output ?? null,
        referenceSolution: q.reference_solution ?? null,
        sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
        testCases: Array.isArray(q.test_cases) ? q.test_cases.map((t, i) => ({ name: t?.name || `Test case ${i + 1}`, input: t?.input ?? "", expectedOutput: t?.expected_output ?? t?.expectedOutput ?? "", hidden: t?.hidden ?? true })) : [],
        judge: ans?.judge_result ?? null,
        marksAwarded,
        isCorrect: marksAwarded >= Number(q.marks) && Number(q.marks) > 0,
        isPartial: marksAwarded > 0 && marksAwarded < Number(q.marks),
        answered: !!ans?.code_answer,
      };
    }

    if (type === "fill_blank") {
      const marksAwarded = Number(ans?.marks_awarded ?? 0);
      return {
        questionId: q.id,
        type: "fill_blank",
        text: q.question_text,
        marks: q.marks,
        submittedBlanks: ans?.blank_answer ?? null,
        correctBlanks: q.blank_answers ?? null,
        marksAwarded,
        isCorrect: marksAwarded >= Number(q.marks) && Number(q.marks) > 0,
        isPartial: marksAwarded > 0 && marksAwarded < Number(q.marks),
        answered: Array.isArray(ans?.blank_answer) && ans.blank_answer.some((b) => String(b || "").trim()),
      };
    }

    const correctOption = options.find((o) => o.is_correct);
    const selectedOption = ans ? options.find((o) => o.id === ans.selected_option_id) : null;
    return {
      questionId: q.id,
      type: "mcq",
      text: q.question_text,
      marks: q.marks,
      correctOption: correctOption?.option_text ?? null,
      selectedOption: selectedOption?.option_text ?? null,
      isCorrect: !!selectedOption && selectedOption.id === correctOption?.id,
      marksAwarded: ans?.marks_awarded !== null && ans?.marks_awarded !== undefined ? Number(ans.marks_awarded) : null,
      answered: !!ans,
    };
  });

  const enrichedAttempt = {
    ...attempt,
    _quiz: quizById[attempt.quiz_id] ? { id: quizById[attempt.quiz_id].id, title: quizById[attempt.quiz_id].title } : null,
    _student: studentById[attempt.student_id] || null,
  };

  res.json({ success: true, result: resultRow(enrichedAttempt), questionBreakdown });
});

const deleteResult = asyncHandler(async (req, res) => {
  const { attemptId } = req.params;
  if (!attemptId) throw new ApiError(400, "Attempt id is required");

  const { data: attempt, error: findError } = await docById("quiz_attempts", attemptId);
  if (findError) throw new ApiError(500, "Failed to load result", findError.message);
  if (!attempt) throw new ApiError(404, "Result not found or already deleted");

  await deleteDocs("answers", [["attempt_id", "==", attempt.id]]);
  await deleteDoc("quiz_attempts", attempt.id);

  // Best-effort: remove attendance row
  if (attempt.student_id && attempt.quiz_id) {
    const { data: attRows } = await queryDocs("attendance", [["quiz_id", "==", attempt.quiz_id], ["student_id", "==", attempt.student_id]]);
    for (const row of (attRows || [])) await deleteDoc("attendance", row.id).catch(() => {});
  }

  res.json({ success: true, deletedId: attempt.id });
});

module.exports = { listResults, getResultDetail, deleteResult };
