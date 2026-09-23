const {
  docById,
  queryDocs,
  allDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  upsertDoc,
} = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { gradeAttempt } = require("../utils/scoring");
const { seededShuffle } = require("../utils/shuffle");
const { SUPPORTED_LANGUAGES } = require("../utils/codeRunner");
const { dispatchJudgeJob } = require("../utils/jobQueue");
const { emitAdmin } = require("../realtime");
const { rankAttempts, timeTakenSeconds } = require("../utils/ranking");
const { buildAnswerReview } = require("../utils/answerReview");
const { abortSignalForRequest } = require("../utils/requestAbort");

function ensureOwnQuiz(req) {
  if (req.student.quizId !== req.params.id) {
    throw new ApiError(403, "This session does not belong to this quiz");
  }
}

const LOGOUT_REASON_TEXT = {
  tab_switch: "You switched away from the quiz tab or minimized the window.",
  window_blur: "You switched to another application or window.",
  fullscreen_exit: "You exited fullscreen / secure quiz mode.",
  new_tab_blocked: "You tried to open another tab, window, or a third-party/external site.",
  devtools_attempt: "You tried to open developer tools.",
  navigation_attempt: "You tried to leave the quiz page.",
  screenshot_attempt: "A screenshot / screen-capture attempt was detected.",
};

function logoutMessageFor(reason, { hard, limit } = {}) {
  const cause = LOGOUT_REASON_TEXT[reason] || "Suspicious activity outside the quiz was detected.";
  if (hard) {
    return `${cause} This is a quiz-security violation, so your attempt was immediately submitted and you were signed out.`;
  }
  return `${cause} The proctoring limit (${limit}) was reached, so your attempt was automatically submitted and you were signed out of the quiz.`;
}

async function recordLogoutEvent({ studentId, quizId, quizTitle, reason, message, details }) {
  try {
    await addDoc("student_logout_events", {
      student_id: studentId,
      quiz_id: quizId,
      quiz_title: quizTitle,
      reason,
      message,
      details: details || null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Best effort
  }
}

async function loadQuizQuestions(supabase, quizId) {
  const { data: rawQuestions, error } = await queryDocs("questions", [["quiz_id", "==", quizId]], {
    orderBy: "order_index",
    direction: "asc",
  });
  if (error) throw new ApiError(500, "Failed to load questions", error.message);

  const { data: options } = await queryDocs("quiz_options", [["quiz_id", "==", quizId]]);
  const optionsByQuestion = {};
  (options || []).forEach((o) => {
    if (!optionsByQuestion[o.question_id]) optionsByQuestion[o.question_id] = [];
    optionsByQuestion[o.question_id].push(o);
  });

  return (rawQuestions || []).map((q) => ({
    ...q,
    quiz_options: (optionsByQuestion[q.id] || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
  }));
}

async function loadQuizRounds(supabase, quizId) {
  const { data, error } = await queryDocs("rounds", [["quiz_id", "==", quizId]], {
    orderBy: "order_index",
    direction: "asc",
  });
  if (error) return [];
  return data || [];
}

function buildQuestionOrder(questions, rounds, { randomize, seed }) {
  const rank = new Map(rounds.map((r, i) => [r.id, i]));
  const groups = new Map();
  questions.forEach((q) => {
    const key = q.round_id && rank.has(q.round_id) ? rank.get(q.round_id) : Number.MAX_SAFE_INTEGER;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q.id);
  });
  return [...groups.keys()]
    .sort((a, b) => a - b)
    .flatMap((key) => {
      const ids = groups.get(key);
      return randomize ? seededShuffle(ids, `${seed}:${key}`) : ids;
    });
}

function deadlineFor(attempt, quiz) {
  const startedAt = new Date(attempt.started_at).getTime();
  return startedAt + quiz.duration_minutes * 60 * 1000;
}

function questionLimitSeconds(question) {
  const limit = Number(question?.time_limit_seconds || 0);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

async function loadTimings(supabase, attemptId) {
  const { data } = await queryDocs("question_timings", [["attempt_id", "==", attemptId]]);
  return data || [];
}

function timingIsExpired(row) {
  if (!row) return false;
  if (row.expired) return true;
  return !!row.expires_at && Date.now() > new Date(row.expires_at).getTime();
}

async function ensureTiming(supabase, attempt, question) {
  const limit = questionLimitSeconds(question);
  const { data: existing } = await queryDocs("question_timings", [
    ["attempt_id", "==", attempt.id],
    ["question_id", "==", question.id],
  ], { limit: 1 });

  const row = existing && existing[0];
  if (row) {
    if (!row.expired && timingIsExpired(row)) {
      await updateDoc("question_timings", row.id, { expired: true });
      return { ...row, expired: true };
    }
    return row;
  }

  const startedAt = new Date();
  const fields = {
    attempt_id: attempt.id,
    question_id: question.id,
    started_at: startedAt.toISOString(),
    expires_at: limit ? new Date(startedAt.getTime() + limit * 1000).toISOString() : null,
    expired: false,
  };
  const { data: created } = await addDoc("question_timings", fields);
  return created || { ...fields, question_id: question.id };
}

async function answerColumns() {
  return ["question_id", "selected_option_id", "code_answer", "blank_answer", "judge_result", "language"];
}

function summarizeJudge(judge) {
  if (!judge || typeof judge !== "object") return null;
  return {
    status: judge.status || "ok",
    passed: Number(judge.passed || 0),
    total: Number(judge.total || 0),
    language: judge.language || null,
    message: judge.message || null,
    judgedAt: judge.judgedAt || null,
  };
}

function shapeTiming(row) {
  return {
    questionId: row.question_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    expired: timingIsExpired(row),
    remainingSeconds: row.expires_at
      ? Math.max(0, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000))
      : null,
  };
}

function roundRequirement(round) {
  const pct = Number(round?.qualification_percentage || 0);
  return Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : 0;
}

async function loadAnswersMap(supabase, attemptId) {
  const { data: answers, error } = await queryDocs("answers", [["attempt_id", "==", attemptId]]);
  if (error) throw new ApiError(500, "Failed to load answers", error.message);
  return new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );
}

function evaluateRound(round, questions, answersMap) {
  const roundQuestions = questions.filter((q) => q.round_id === round.id);
  const graded = gradeAttempt(roundQuestions, answersMap);
  const totalQuestions = roundQuestions.length;
  const required = roundRequirement(round);
  const percentage = totalQuestions ? Math.round((graded.correct / totalQuestions) * 1000) / 10 : 0;
  const requiredCorrect = totalQuestions ? Math.ceil((required / 100) * totalQuestions) : 0;
  return {
    roundId: round.id,
    roundName: round.name,
    totalQuestions,
    correct: graded.correct,
    wrong: graded.wrong,
    unanswered: graded.unanswered,
    obtainedMarks: graded.obtainedMarks,
    totalMarks: graded.totalMarks,
    percentage,
    requiredPercentage: required,
    requiredCorrect,
    qualified: required === 0 || totalQuestions === 0 || graded.correct >= requiredCorrect,
  };
}

async function previousRoundsCleared(supabase, attempt, quiz, rounds, roundId) {
  const index = rounds.findIndex((r) => r.id === roundId);
  if (index <= 0) return true;
  const gated = rounds.slice(0, index).filter((r) => roundRequirement(r) > 0);
  if (!gated.length) return true;
  const [questions, answersMap] = await Promise.all([
    loadQuizQuestions(supabase, quiz.id),
    loadAnswersMap(supabase, attempt.id),
  ]);
  return gated.every((r) => evaluateRound(r, questions, answersMap).qualified);
}

async function judgePendingCodingAnswers(supabase, attempt, questions, answersMap) {
  const pending = questions.filter((q) => {
    if (q.question_type !== "coding") return false;
    const answer = answersMap.get(q.id);
    if (!answer || !answer.code || !String(answer.code).trim()) return false;
    return !answer.judge;
  });
  if (!pending.length) return;

  for (const question of pending) {
    const answer = answersMap.get(question.id);
    try {
      const languages =
        Array.isArray(question.allowed_languages) && question.allowed_languages.length
          ? question.allowed_languages
          : [question.language];
      const verdict = await dispatchJudgeJob("test_cases", {
        language: answer.language || languages[0],
        source: answer.code,
        testCases: Array.isArray(question.test_cases) ? question.test_cases : [],
        timeLimitMs: question.time_limit_ms ? Number(question.time_limit_ms) : 3000,
        expectedOutput: question.expected_output,
      });
      const judge = {
        status: verdict.status,
        passed: verdict.passed,
        total: verdict.total,
        language: answer.language || languages[0] || null,
        message: verdict.message || null,
        judgedAt: new Date().toISOString(),
        cases: verdict.results || [],
      };
      answersMap.set(question.id, { ...answer, judge });

      const { data: ansRows } = await queryDocs("answers", [
        ["attempt_id", "==", attempt.id],
        ["question_id", "==", question.id],
      ]);
      if (ansRows && ansRows[0]) {
        await updateDoc("answers", ansRows[0].id, { judge_result: judge });
      }
    } catch (err) {
      console.error("Auto-judge failed for question", question.id, err.message);
    }
  }
}

async function finalizeAttempt(supabase, attempt, quiz, status) {
  const questions = await loadQuizQuestions(supabase, quiz.id);
  const { data: answers, error: answersError } = await queryDocs("answers", [["attempt_id", "==", attempt.id]]);
  if (answersError) throw new ApiError(500, "Failed to load answers for grading", answersError.message);

  const answersMap = new Map(
    (answers || []).map((a) => [
      a.question_id,
      { optionId: a.selected_option_id, code: a.code_answer, blanks: a.blank_answer, judge: a.judge_result || null },
    ])
  );
  await judgePendingCodingAnswers(supabase, attempt, questions, answersMap);

  const graded = gradeAttempt(questions, answersMap);
  const passed = quiz.max_marks > 0 ? graded.percentage >= Number(quiz.passing_percentage) : false;

  if (graded.perQuestion.length) {
    for (const pq of graded.perQuestion) {
      const match = (answers || []).find((a) => a.question_id === pq.questionId);
      if (match) {
        await updateDoc("answers", match.id, { marks_awarded: pq.marksAwarded }).catch(() => {});
      }
    }
  }

  await updateDoc("quiz_attempts", attempt.id, {
    status,
    submitted_at: new Date().toISOString(),
    total_marks: graded.totalMarks,
    obtained_marks: graded.obtainedMarks,
    correct_count: graded.correct,
    wrong_count: graded.wrong,
    unanswered_count: graded.unanswered,
    percentage: graded.percentage,
    passed,
  });

  const { data: updatedAttempt } = await docById("quiz_attempts", attempt.id);

  const { data: attRows } = await queryDocs("attendance", [
    ["quiz_id", "==", quiz.id],
    ["student_id", "==", attempt.student_id],
  ]);
  if (attRows && attRows[0]) {
    await updateDoc("attendance", attRows[0].id, {
      submission_time: new Date().toISOString(),
      completed: true,
    });
  }

  // Clear active session lock
  await updateDoc("students", attempt.student_id, {
    active_session_token: null,
    active_session_quiz_id: null,
    active_session_started_at: null,
  }).catch(() => {});

  emitAdmin("attempt:submitted", {
    quizId: quiz.id,
    attemptId: attempt.id,
    studentId: attempt.student_id,
    status,
    obtainedMarks: graded.obtainedMarks,
    totalMarks: graded.totalMarks,
    percentage: graded.percentage,
    passed,
  });

  return updatedAttempt || attempt;
}

function optionsForClient(options, { randomize, seed, questionId }) {
  const list = (options || []).map((o) => ({ id: o.id, text: o.option_text }));
  return randomize ? seededShuffle(list, `${seed}:${questionId}`) : list;
}

function questionsForClient(questions, answersMap, quiz, seed, timingsMap = new Map()) {
  return questions.map((q) => {
    const answer = answersMap.get(q.id);
    const type = q.question_type || "mcq";

    return {
      id: q.id,
      roundId: q.round_id || null,
      type,
      text: q.question_text,
      marks: q.marks,
      negativeMarks: q.negative_marks,
      timeLimitSeconds: questionLimitSeconds(q),
      language: q.language || null,
      starterCode: q.starter_code || null,
      problemStatement: q.problem_statement || "",
      inputFormat: q.input_format || "",
      outputFormat: q.output_format || "",
      constraintsText: q.constraints_text || "",
      sampleIo: Array.isArray(q.sample_io) ? q.sample_io : [],
      timeLimitMs: q.time_limit_ms ? Number(q.time_limit_ms) : 3000,
      allowedLanguages:
        Array.isArray(q.allowed_languages) && q.allowed_languages.length
          ? q.allowed_languages
          : q.language
          ? [q.language]
          : [],
      timing: timingsMap.has(q.id) ? shapeTiming(timingsMap.get(q.id)) : null,
      ...(type === "mcq"
        ? { options: optionsForClient(q.quiz_options, { randomize: quiz.randomize_options, seed, questionId: q.id }) }
        : {}),
      ...(type === "fill_blank" ? { blankCount: Array.isArray(q.blank_answers) ? q.blank_answers.length : 1 } : {}),
      savedAnswer: {
        optionId: answer?.optionId ?? null,
        code: answer?.code ?? null,
        blanks: answer?.blanks ?? null,
        judge: summarizeJudge(answer?.judge),
      },
    };
  });
}

// POST /api/quizzes/:id/start
const startAttempt = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { data: quiz, error: quizError } = await docById("quizzes", req.params.id);
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (quiz.status === "draft") throw new ApiError(403, "Quiz is not published yet");

  const { data: pastAttempts, error: pastError } = await queryDocs("quiz_attempts", [
    ["quiz_id", "==", quiz.id],
    ["student_id", "==", req.student.studentId],
  ]);
  if (pastError) throw new ApiError(500, "Failed to verify past attempts", pastError.message);

  const attemptsList = pastAttempts || [];
  const inProgress = attemptsList.find((a) => a.status === "in_progress");

  let attempt = inProgress;
  let questions = await loadQuizQuestions(null, quiz.id);
  let rounds = await loadQuizRounds(null, quiz.id);

  if (attempt) {
    const deadline = deadlineFor(attempt, quiz);
    if (Date.now() > deadline) {
      attempt = await finalizeAttempt(null, attempt, quiz, "auto_submitted");
      return res.json({
        success: true,
        resumed: false,
        attempt: { id: attempt.id, status: attempt.status, timeExpired: true },
      });
    }
  } else {
    const submittedCount = attemptsList.filter((a) => a.status === "submitted" || a.status === "auto_submitted").length;
    if (submittedCount >= quiz.max_attempts) {
      throw new ApiError(403, "You have reached the maximum allowed attempts for this quiz");
    }

    const nextAttemptNumber = attemptsList.length + 1;
    const seed = `${req.student.studentId}:${quiz.id}:${nextAttemptNumber}`;
    const questionOrder = buildQuestionOrder(questions, rounds, { randomize: quiz.randomize_questions, seed });

    const { data: created, error: createError } = await addDoc("quiz_attempts", {
      quiz_id: quiz.id,
      student_id: req.student.studentId,
      attempt_number: nextAttemptNumber,
      status: "in_progress",
      started_at: new Date().toISOString(),
      question_order: questionOrder,
      violations_count: 0,
      current_question_index: 0,
    });
    if (createError) throw new ApiError(500, "Failed to start quiz attempt", createError.message);
    attempt = created;

    emitAdmin("attempt:started", {
      quizId: quiz.id,
      attemptId: attempt.id,
      studentId: attempt.student_id,
      attemptNumber: nextAttemptNumber,
    });
  }

  const order = Array.isArray(attempt.question_order) ? attempt.question_order : [];
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    questions.sort(
      (a, b) =>
        (rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER) -
        (rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER)
    );
  }

  const answersMap = await loadAnswersMap(null, attempt.id);

  let currentQuestionIndex = Number(attempt.current_question_index || 0);
  if (!Number.isFinite(currentQuestionIndex) || currentQuestionIndex < 0) currentQuestionIndex = 0;
  if (questions.length && currentQuestionIndex >= questions.length) currentQuestionIndex = questions.length - 1;

  if (questions.length) {
    await ensureTiming(null, attempt, questions[currentQuestionIndex]);
  }

  const rawTimings = await loadTimings(null, attempt.id);
  const timingsMap = new Map((rawTimings || []).map((t) => [t.question_id, t]));

  const roundsWithStatus = rounds.map((r, i) => {
    const ev = evaluateRound(r, questions, answersMap);
    return {
      id: r.id,
      name: r.name,
      description: r.description || "",
      order: r.order_index,
      qualificationPercentage: ev.requiredPercentage,
      requiredCorrect: ev.requiredCorrect,
      qualified: ev.qualified,
      unlocked: i === 0 || ev.qualified,
      stats: { total: ev.totalQuestions, correct: ev.correct, percentage: ev.percentage },
    };
  });

  const seed = `${req.student.studentId}:${quiz.id}:${attempt.attempt_number}`;
  const deadline = deadlineFor(attempt, quiz);
  const remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));

  res.json({
    success: true,
    resumed: !!inProgress,
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.started_at,
      deadlineAt: new Date(deadline).toISOString(),
      remainingSeconds,
      violationsCount: attempt.violations_count,
      currentQuestionIndex,
    },
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMinutes: quiz.duration_minutes,
      maxMarks: quiz.max_marks,
      tabSwitchLimit: quiz.tab_switch_limit,
    },
    rounds: roundsWithStatus,
    questions: questionsForClient(questions, answersMap, quiz, seed, timingsMap),
  });
});

// POST /api/quizzes/:id/activate-question
const activateQuestion = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { attemptId, questionId, questionIndex } = req.body || {};
  if (!attemptId || !questionId) throw new ApiError(400, "attemptId and questionId are required");

  const { data: attempt } = await docById("quiz_attempts", attemptId);
  if (!attempt || attempt.student_id !== req.student.studentId || attempt.status !== "in_progress") {
    throw new ApiError(404, "Active quiz attempt not found");
  }

  const { data: question } = await docById("questions", questionId);
  if (!question || question.quiz_id !== req.params.id) throw new ApiError(404, "Question not found");

  if (Number.isFinite(Number(questionIndex)) && Number(questionIndex) >= 0) {
    await updateDoc("quiz_attempts", attempt.id, { current_question_index: Math.round(Number(questionIndex)) }).catch(() => {});
  }

  const timingRow = await ensureTiming(null, attempt, question);
  res.json({ success: true, timing: shapeTiming(timingRow) });
});

// POST /api/quizzes/:id/answer
const saveAnswer = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { attemptId, questionId, optionId, codeAnswer, blankAnswer, language } = req.body || {};
  if (!attemptId || !questionId) throw new ApiError(400, "attemptId and questionId are required");

  const { data: attempt } = await docById("quiz_attempts", attemptId);
  if (!attempt || attempt.student_id !== req.student.studentId) throw new ApiError(404, "Attempt not found");
  if (attempt.status !== "in_progress") throw new ApiError(400, "Attempt is already completed");

  const { data: quiz } = await docById("quizzes", req.params.id);
  if (Date.now() > deadlineFor(attempt, quiz)) {
    const finalized = await finalizeAttempt(null, attempt, quiz, "auto_submitted");
    return res.status(400).json({ success: false, message: "Time is up", attempt: { status: finalized.status } });
  }

  const { data: question } = await docById("questions", questionId);
  if (!question) throw new ApiError(404, "Question not found");

  const limitRow = (await loadTimings(null, attempt.id)).find((t) => t.question_id === questionId);
  if (timingIsExpired(limitRow)) {
    throw new ApiError(403, "Time has expired for this question; answers can no longer be saved.");
  }

  const type = question.question_type || "mcq";
  const answerPayload = {
    attempt_id: attempt.id,
    question_id: question.id,
    selected_option_id: type === "mcq" ? optionId || null : null,
    code_answer: type === "coding" ? codeAnswer ?? null : null,
    blank_answer: type === "fill_blank" ? (Array.isArray(blankAnswer) ? blankAnswer : null) : null,
    language: type === "coding" ? language || question.language || null : null,
    answered_at: new Date().toISOString(),
  };

  await upsertDoc("answers", [["attempt_id", "==", attempt.id], ["question_id", "==", question.id]], answerPayload);

  res.json({ success: true, message: "Answer saved" });
});

// POST /api/quizzes/:id/run-code
const runCode = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { questionId, language, source, stdin } = req.body || {};
  if (!questionId) throw new ApiError(400, "questionId is required");

  const { data: question } = await docById("questions", questionId);
  if (!question || question.quiz_id !== req.params.id) throw new ApiError(404, "Question not found");
  if (question.question_type !== "coding") throw new ApiError(400, "Question is not a programming problem");

  const chosenLang = language || question.language;
  const timeLimitMs = question.time_limit_ms ? Number(question.time_limit_ms) : 3000;
  const inputToRun = stdin !== undefined && stdin !== null ? String(stdin) : (question.sample_io?.[0]?.input ?? "");

  const { signal, cleanup } = abortSignalForRequest(req, res);
  let result;
  try {
    result = await dispatchJudgeJob("run", { language: chosenLang, source, stdin: inputToRun, timeLimitMs }, signal);
  } finally {
    cleanup();
  }

  if (res.writableEnded || res.destroyed) return;
  res.json({ success: true, run: result });
});

// POST /api/quizzes/:id/submit-code
const submitCode = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { attemptId, questionId, language, source } = req.body || {};
  if (!attemptId || !questionId) throw new ApiError(400, "attemptId and questionId are required");

  const { data: attempt } = await docById("quiz_attempts", attemptId);
  if (!attempt || attempt.student_id !== req.student.studentId) throw new ApiError(404, "Attempt not found");
  if (attempt.status !== "in_progress") throw new ApiError(400, "Attempt is already completed");

  const { data: question } = await docById("questions", questionId);
  if (!question || question.quiz_id !== req.params.id) throw new ApiError(404, "Question not found");

  const chosenLang = language || question.language;
  const timeLimitMs = question.time_limit_ms ? Number(question.time_limit_ms) : 3000;
  const testCases = Array.isArray(question.test_cases) ? question.test_cases : [];

  const { signal, cleanup } = abortSignalForRequest(req, res);
  let verdict;
  try {
    verdict = await dispatchJudgeJob("test_cases", { language: chosenLang, source, testCases, timeLimitMs, expectedOutput: question.expected_output }, signal);
  } finally {
    cleanup();
  }

  if (res.writableEnded || res.destroyed) return;

  const judge = {
    status: verdict.status,
    passed: verdict.passed,
    total: verdict.total,
    language: chosenLang,
    message: verdict.message || null,
    judgedAt: new Date().toISOString(),
    cases: verdict.results || [],
  };

  await upsertDoc("answers", [["attempt_id", "==", attempt.id], ["question_id", "==", question.id]], {
    attempt_id: attempt.id,
    question_id: question.id,
    code_answer: source,
    language: chosenLang,
    judge_result: judge,
    answered_at: new Date().toISOString(),
  });

  const plainRun = verdict.firstFailureRun || {
    status: verdict.status === "accepted" ? "ok" : verdict.status,
    stdout: verdict.results?.[0]?.stdout || "",
    stderr: verdict.results?.[0]?.stderr || "",
    compileOutput: verdict.compileOutput || "",
    timeMs: verdict.totalTimeMs,
  };

  const terminal = [
    verdict.compileOutput ? `[Compiler Output]\n${verdict.compileOutput}` : null,
    verdict.status === "accepted"
      ? `ALL TEST CASES PASSED (${verdict.passed}/${verdict.total})`
      : `SUBMISSION ${verdict.status.toUpperCase()} (${verdict.passed}/${verdict.total} test cases passed)`,
    verdict.message || null,
  ].filter(Boolean).join("\n\n");

  res.json({
    success: true,
    judge: summarizeJudge(judge),
    results: verdict.results,
    run: plainRun,
    terminal,
  });
});

// POST /api/quizzes/:id/violation
const logViolation = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { attemptId, reason, action, hard } = req.body || {};
  if (!attemptId) throw new ApiError(400, "attemptId is required");

  const { data: attempt } = await docById("quiz_attempts", attemptId);
  if (!attempt || attempt.student_id !== req.student.studentId) throw new ApiError(404, "Attempt not found");
  if (attempt.status !== "in_progress") {
    return res.json({ success: true, violationsCount: attempt.violations_count, autoSubmitted: true });
  }

  const { data: quiz } = await docById("quizzes", req.params.id);
  const limit = quiz.tab_switch_limit || 3;
  const isHardViolation = Boolean(hard);

  const updatedCount = (attempt.violations_count || 0) + 1;
  const limitExceeded = isHardViolation || updatedCount >= limit;

  await updateDoc("quiz_attempts", attempt.id, { violations_count: updatedCount });

  const { data: student } = await docById("students", attempt.student_id);

  emitAdmin("attempt:violation", {
    quizId: quiz.id,
    attemptId: attempt.id,
    studentId: attempt.student_id,
    studentName: student?.name,
    registerNumber: student?.register_number,
    reason: reason || "tab_switch",
    violationsCount: updatedCount,
    limit,
    hard: isHardViolation,
    limitExceeded,
  });

  if (limitExceeded || action === "auto_submit") {
    const finalized = await finalizeAttempt(null, attempt, quiz, "auto_submitted");
    const message = logoutMessageFor(reason, { hard: isHardViolation, limit });
    await recordLogoutEvent({
      studentId: attempt.student_id,
      quizId: quiz.id,
      quizTitle: quiz.title,
      reason: reason || "proctoring_limit",
      message,
      details: { violationsCount: updatedCount, limit, hard: isHardViolation },
    });
    return res.json({
      success: true,
      violationsCount: updatedCount,
      autoSubmitted: true,
      status: finalized.status,
      message,
      forceLogout: true,
    });
  }

  res.json({ success: true, violationsCount: updatedCount, autoSubmitted: false });
});

// POST /api/quizzes/:id/rounds/:roundId/complete
const completeRound = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { attemptId } = req.body || {};
  const { roundId } = req.params;
  if (!attemptId) throw new ApiError(400, "attemptId is required");

  const { data: attempt } = await docById("quiz_attempts", attemptId);
  if (!attempt || attempt.student_id !== req.student.studentId) throw new ApiError(404, "Attempt not found");

  const { data: round } = await docById("rounds", roundId);
  if (!round || round.quiz_id !== req.params.id) throw new ApiError(404, "Round not found");

  const questions = await loadQuizQuestions(null, req.params.id);
  const answersMap = await loadAnswersMap(null, attempt.id);
  const evalResult = evaluateRound(round, questions, answersMap);

  res.json({ success: true, round: evalResult });
});

// POST /api/quizzes/:id/submit
const submitAttempt = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);
  const { attemptId } = req.body || {};
  if (!attemptId) throw new ApiError(400, "attemptId is required");

  const { data: attempt } = await docById("quiz_attempts", attemptId);
  if (!attempt || attempt.student_id !== req.student.studentId) throw new ApiError(404, "Attempt not found");
  if (attempt.status !== "in_progress") throw new ApiError(400, "Attempt is already completed");

  const { data: quiz } = await docById("quizzes", req.params.id);
  const finalized = await finalizeAttempt(null, attempt, quiz, "submitted");

  res.json({
    success: true,
    attempt: {
      id: finalized.id,
      status: finalized.status,
      totalMarks: finalized.total_marks,
      obtainedMarks: finalized.obtained_marks,
      percentage: finalized.percentage,
      passed: finalized.passed,
    },
  });
});

// GET /api/quizzes/:id/result
const myResult = asyncHandler(async (req, res) => {
  ensureOwnQuiz(req);

  const { data: attempts } = await queryDocs("quiz_attempts", [
    ["quiz_id", "==", req.params.id],
    ["student_id", "==", req.student.studentId],
  ]);

  const attempt = (attempts || []).find((a) => a.status === "submitted" || a.status === "auto_submitted");
  if (!attempt) throw new ApiError(404, "No completed attempt found for this quiz");

  const { data: quiz } = await docById("quizzes", req.params.id);
  const questions = await loadQuizQuestions(null, quiz.id);

  const order = Array.isArray(attempt.question_order) ? attempt.question_order : [];
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    questions.sort(
      (a, b) =>
        (rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER) -
        (rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER)
    );
  }

  const answersMap = await loadAnswersMap(null, attempt.id);

  res.json({
    success: true,
    showLeaderboard: quiz.show_leaderboard,
    attempt: {
      id: attempt.id,
      quizTitle: quiz.title,
      attemptNumber: attempt.attempt_number,
      totalMarks: attempt.total_marks,
      obtainedMarks: attempt.obtained_marks,
      percentage: attempt.percentage,
      correct: attempt.correct_count,
      wrong: attempt.wrong_count,
      unanswered: attempt.unanswered_count,
      passed: attempt.passed,
      violationsCount: attempt.violations_count,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      timeTakenSeconds: timeTakenSeconds(attempt),
    },
    review: buildAnswerReview(questions, answersMap),
  });
});

// GET /api/quizzes/:id/leaderboard
const leaderboard = asyncHandler(async (req, res) => {
  const { data: quiz } = await docById("quizzes", req.params.id);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (!quiz.show_leaderboard) throw new ApiError(403, "Leaderboard is disabled for this quiz");

  const { data: attempts } = await queryDocs("quiz_attempts", [
    ["quiz_id", "==", quiz.id],
    ["status", "in", ["submitted", "auto_submitted"]],
  ]);

  const { data: students } = await allDocs("students");
  const studentById = Object.fromEntries((students || []).map((s) => [s.id, s]));

  const enrichedAttempts = (attempts || []).map((a) => ({
    ...a,
    students: studentById[a.student_id] || null,
  }));

  const ranked = rankAttempts(enrichedAttempts);

  res.json({
    success: true,
    leaderboard: ranked.map((a) => ({
      rank: a.__rank,
      studentName: a.students?.name || "Student",
      registerNumber: a.students?.register_number || "",
      department: a.students?.department || "",
      year: a.students?.year || "",
      section: a.students?.section || "",
      obtainedMarks: a.obtained_marks,
      totalMarks: a.total_marks,
      percentage: a.percentage,
      timeTakenSeconds: timeTakenSeconds(a),
    })),
  });
});

module.exports = {
  activateQuestion,
  startAttempt,
  saveAnswer,
  runCode,
  submitCode,
  logViolation,
  completeRound,
  submitAttempt,
  myResult,
  leaderboard,
  loadQuizQuestions,
  answerColumns,
};
