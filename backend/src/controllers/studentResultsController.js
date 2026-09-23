const { docById, queryDocs, allDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { buildFullAnswerReview } = require("../utils/answerReview");

const listMyResults = asyncHandler(async (req, res) => {
  const { data: attempts, error } = await queryDocs("quiz_attempts", [
    ["student_id", "==", req.student.studentId],
    ["status", "in", ["submitted", "auto_submitted"]],
  ], { orderBy: "submitted_at", direction: "desc" });

  if (error) throw new ApiError(500, "Failed to load results", error.message);

  const { data: quizzes } = await allDocs("quizzes");
  const quizById = Object.fromEntries((quizzes || []).map((q) => [q.id, q]));

  const results = (attempts || []).map((a) => ({
    attemptId: a.id,
    quizId: a.quiz_id,
    quizTitle: quizById[a.quiz_id]?.title || "Untitled quiz",
    totalMarks: a.total_marks,
    obtainedMarks: a.obtained_marks,
    percentage: a.percentage,
    passed: a.passed,
    correct: a.correct_count,
    wrong: a.wrong_count,
    unanswered: a.unanswered_count,
    submittedAt: a.submitted_at,
  }));

  const cumulativePercentage = results.length
    ? Math.round(
        (results.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0) / results.length) * 100
      ) / 100
    : null;

  res.json({
    success: true,
    results,
    cumulativePercentage,
    quizzesAttended: results.length,
  });
});

const getMyAttemptDetail = asyncHandler(async (req, res) => {
  const { data: attempt, error } = await docById("quiz_attempts", req.params.attemptId);
  if (error) throw new ApiError(500, "Failed to load attempt", error.message);
  if (!attempt || attempt.student_id !== req.student.studentId || !["submitted", "auto_submitted"].includes(attempt.status)) {
    throw new ApiError(404, "Attempt not found");
  }

  const { data: quiz } = await docById("quizzes", attempt.quiz_id);
  const { data: rawQuestions } = await queryDocs("questions", [["quiz_id", "==", attempt.quiz_id]], { orderBy: "order_index", direction: "asc" });
  const { data: options } = await queryDocs("quiz_options", [["quiz_id", "==", attempt.quiz_id]]);

  const optionsByQuestion = {};
  (options || []).forEach((o) => {
    if (!optionsByQuestion[o.question_id]) optionsByQuestion[o.question_id] = [];
    optionsByQuestion[o.question_id].push(o);
  });

  let questions = (rawQuestions || []).map((q) => ({
    id: q.id,
    quizId: q.quiz_id,
    roundId: q.round_id || null,
    type: q.question_type || "mcq",
    text: q.question_text,
    marks: q.marks,
    negativeMarks: q.negative_marks,
    order: q.order_index,
    language: q.language || null,
    starterCode: q.starter_code || null,
    expectedOutput: q.expected_output || null,
    referenceSolution: q.reference_solution || null,
    problemStatement: q.problem_statement || "",
    inputFormat: q.input_format || "",
    outputFormat: q.output_format || "",
    constraintsText: q.constraints_text || "",
    sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
    testCases: Array.isArray(q.test_cases) ? q.test_cases : [],
    timeLimitMs: q.time_limit_ms ? Number(q.time_limit_ms) : 3000,
    allowedLanguages: Array.isArray(q.allowed_languages) && q.allowed_languages.length ? q.allowed_languages : q.language ? [q.language] : [],
    blankAnswers: q.question_type === "fill_blank" ? q.blank_answers || [[]] : [],
    caseSensitive: !!q.case_sensitive,
    options: (optionsByQuestion[q.id] || []).map((o) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct })),
  }));

  const order = Array.isArray(attempt.question_order) ? attempt.question_order : [];
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    questions.sort(
      (a, b) =>
        (rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER) -
        (rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER)
    );
  }

  const { data: answers } = await queryDocs("answers", [["attempt_id", "==", attempt.id]]);
  const answersMap = new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );

  res.json({
    success: true,
    attempt: {
      attemptId: attempt.id,
      quizId: attempt.quiz_id,
      quizTitle: quiz?.title || "Untitled quiz",
      totalMarks: attempt.total_marks,
      obtainedMarks: attempt.obtained_marks,
      percentage: attempt.percentage,
      passed: attempt.passed,
      submittedAt: attempt.submitted_at,
    },
    questions: buildFullAnswerReview(questions, answersMap),
  });
});

module.exports = { listMyResults, getMyAttemptDetail };
