const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const {
  docById,
  queryDocs,
  addDoc,
  updateDoc,
  upsertDoc,
  countDocs,
} = require("../config/supabaseHelpers");
const { signStudentToken } = require("../utils/jwt");
const { emitAdmin } = require("../realtime");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const {
  DEPARTMENTS,
  YEARS,
  SECTIONS,
  normalizeDepartment,
  normalizeYear,
  normalizeSection,
  normalizeMobileNumber,
} = require("../utils/enums");
const { cacheGet, cacheSet } = require("../config/redis");

const CACHE_TTL = Number(process.env.CACHE_TTL_SECONDS) || 30;
const SESSION_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function acquireQuizSession(student, quiz) {
  const existingToken = student.active_session_token;
  if (existingToken) {
    const startedAtMs = student.active_session_started_at
      ? new Date(student.active_session_started_at).getTime()
      : 0;
    const isStale = !startedAtMs || Date.now() - startedAtMs > SESSION_STALE_MS;

    let stillActive = false;
    if (!isStale && student.active_session_quiz_id) {
      const { data: lockedAttempts } = await queryDocs("quiz_attempts", [
        ["quiz_id", "==", student.active_session_quiz_id],
        ["student_id", "==", student.id],
        ["status", "==", "in_progress"],
      ]);
      stillActive = lockedAttempts && lockedAttempts.length > 0;
    }

    if (stillActive) {
      const sameQuiz = student.active_session_quiz_id === quiz.id;
      throw new ApiError(
        409,
        sameQuiz
          ? "This Register Number already has an active quiz session open on another device or tab. Log out from there first, then rejoin here to resume exactly where you left off."
          : "This Register Number already has an active quiz session on another quiz. Finish or log out of that session before starting a new one."
      );
    }
  }

  const sessionToken = crypto.randomUUID();
  await updateDoc("students", student.id, {
    active_session_token: sessionToken,
    active_session_quiz_id: quiz.id,
    active_session_started_at: new Date().toISOString(),
  });
  return sessionToken;
}

// GET /api/quizzes?placement=quizzes|landing
const listPublicQuizzes = asyncHandler(async (req, res) => {
  const placement = req.query.placement === "landing" ? "landing" : "quizzes";
  const cacheKey = `public_quizzes:${placement}`;
  if (process.env.CACHE_ENABLED === "true") {
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);
  }

  const { data: quizzes, error } = await queryDocs(
    "quizzes",
    [["status", "!=", "draft"], ["placement", "==", placement]],
    { orderBy: "created_at", direction: "desc" }
  );
  if (error) throw new ApiError(500, "Failed to load quizzes", error.message);

  const quizIds = (quizzes || []).map((q) => q.id);
  const { data: questionRows } = quizIds.length
    ? await queryDocs("questions", [["quiz_id", "in", quizIds]])
    : { data: [] };
  const { data: attendanceRows } = quizIds.length
    ? await queryDocs("attendance", [["quiz_id", "in", quizIds]])
    : { data: [] };

  const qCount = {};
  (questionRows || []).forEach((r) => (qCount[r.quiz_id] = (qCount[r.quiz_id] || 0) + 1));
  const pCount = {};
  (attendanceRows || []).forEach((r) => (pCount[r.quiz_id] = (pCount[r.quiz_id] || 0) + 1));

  const payload = {
    success: true,
    quizzes: (quizzes || []).map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      durationMinutes: q.duration_minutes,
      startTime: q.start_time,
      endTime: q.end_time,
      maxMarks: q.max_marks,
      status: q.status,
      questionCount: qCount[q.id] || 0,
      participantCount: pCount[q.id] || 0,
    })),
  };
  
  if (process.env.CACHE_ENABLED === "true") await cacheSet(cacheKey, payload, CACHE_TTL);
  res.json(payload);
});

// GET /api/quizzes/:id
const getPublicQuiz = asyncHandler(async (req, res) => {
  const cacheKey = `public_quiz:${req.params.id}`;
  if (process.env.CACHE_ENABLED === "true") {
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);
  }

  const { data: quiz, error } = await docById("quizzes", req.params.id);
  if (error) throw new ApiError(500, "Failed to load quiz", error.message);
  if (!quiz || quiz.status === "draft") throw new ApiError(404, "Quiz not found");

  const questionCount = await countDocs("questions", [["quiz_id", "==", quiz.id]]);
  const payload = {
    success: true,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMinutes: quiz.duration_minutes,
      startTime: quiz.start_time,
      endTime: quiz.end_time,
      maxMarks: quiz.max_marks,
      status: quiz.status,
      questionCount,
      placement: quiz.placement || "quizzes",
      isDemo: quiz.placement === "landing",
    },
  };
  
  if (process.env.CACHE_ENABLED === "true") await cacheSet(cacheKey, payload, CACHE_TTL);
  res.json(payload);
});

// POST /api/students/login — join a quiz
const joinQuiz = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { quizId, name, registerNumber, department, year, section, mobileNumber, quizPassword } = body;

  const cleanVal = (v) => String(v ?? "").trim();
  const errors = [];
  if (!quizId) errors.push("quizId is required");
  if (!cleanVal(name)) errors.push("name is required");
  const registerNumberClean = cleanVal(registerNumber);
  if (!registerNumberClean) errors.push("Registration number is required");
  else if (!/^[0-9]{6}$/.test(registerNumberClean)) errors.push("Registration number must be exactly 6 digits");
  const departmentClean = normalizeDepartment(department);
  if (!cleanVal(department)) errors.push("department is required");
  else if (!departmentClean) errors.push(`department must be one of: ${DEPARTMENTS.join(", ")}`);
  const yearClean = normalizeYear(year);
  if (!cleanVal(year)) errors.push("year is required");
  else if (!yearClean) errors.push(`year must be one of: ${YEARS.join(", ")}`);
  const sectionClean = normalizeSection(section);
  if (!cleanVal(section)) errors.push("section is required");
  else if (!sectionClean) errors.push(`section must be one of: ${SECTIONS.join(", ")}`);
  const mobileNumberClean = normalizeMobileNumber(mobileNumber);
  if (!cleanVal(mobileNumber)) errors.push("Mobile number is required");
  else if (!mobileNumberClean) errors.push("Mobile number must be exactly 10 digits");
  if (!quizPassword) errors.push("password is required");
  if (cleanVal(name).length > 120) errors.push("name is too long");
  if (errors.length) throw new ApiError(400, "Validation failed", errors);

  const { data: quiz, error: quizError } = await docById("quizzes", quizId);
  if (quizError) throw new ApiError(500, "Failed to load quiz", quizError.message);
  if (!quiz) throw new ApiError(404, "Quiz not found");
  if (quiz.status === "draft") throw new ApiError(403, "This quiz is not published yet");
  if (quiz.status === "completed") throw new ApiError(403, "This quiz has already ended");
  if (!bcrypt.compareSync(String(quizPassword), quiz.password_hash)) throw new ApiError(401, "Incorrect quiz password");

  const now = new Date();
  if (quiz.start_time && now < new Date(quiz.start_time)) throw new ApiError(403, "This quiz has not started yet");
  if (quiz.end_time && now > new Date(quiz.end_time) && !quiz.allow_late_join) throw new ApiError(403, "This quiz has ended and late joining is not allowed");

  // Upsert student
  const { data: existing } = await queryDocs("students", [["register_number", "==", registerNumberClean]], { limit: 1 });
  let student = existing && existing[0];

  if (!student) {
    const { data: created, error: createError } = await addDoc("students", {
      name: cleanVal(name),
      register_number: registerNumberClean,
      department: departmentClean,
      year: yearClean,
      section: sectionClean,
      mobile_number: mobileNumberClean,
    });
    if (createError) throw new ApiError(500, "Failed to register student", createError.message);
    student = created;
  } else {
    await updateDoc("students", student.id, {
      name: cleanVal(name),
      department: departmentClean || student.department,
      year: yearClean || student.year,
      section: sectionClean || student.section,
      mobile_number: mobileNumberClean || student.mobile_number || null,
    });
    const { data: refreshed } = await docById("students", student.id);
    student = refreshed;
  }

  // Check attempt limit
  const { data: pastAttempts, error: pastAttemptsError } = await queryDocs("quiz_attempts", [
    ["quiz_id", "==", quizId],
    ["student_id", "==", student.id],
  ]);
  if (pastAttemptsError) throw new ApiError(500, "Failed to verify attempt history", pastAttemptsError.message);

  const submittedCount = (pastAttempts || []).filter((a) => a.status === "submitted" || a.status === "auto_submitted").length;
  const hasInProgress = (pastAttempts || []).some((a) => a.status === "in_progress");

  if (!hasInProgress && submittedCount >= quiz.max_attempts) {
    throw new ApiError(403, "You have already used all allowed attempts for this quiz");
  }

  // Session lock
  const sessionToken = await acquireQuizSession(student, quiz);

  // Record attendance
  const { data: attendance, error: attendanceError } = await upsertDoc(
    "attendance",
    [["quiz_id", "==", quiz.id], ["student_id", "==", student.id]],
    {
      quiz_id: quiz.id,
      student_id: student.id,
      join_time: new Date().toISOString(),
      status: "present",
    },
    false // Disable automatic created_at injection for this table
  );
  if (attendanceError) {
    console.error("ATTENDANCE ERROR LOG:", attendanceError);
    throw new ApiError(500, "Failed to record attendance", attendanceError.message);
  }

  const token = signStudentToken({
    studentId: student.id,
    quizId: quiz.id,
    registerNumber: student.register_number,
    ...(sessionToken ? { sessionToken } : {}),
  });

  emitAdmin("registration:new", {
    quizId: quiz.id,
    student: { id: student.id, name: student.name, registerNumber: student.register_number, department: student.department, year: student.year, section: student.section },
    joinedAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    token,
    student: { id: student.id, name: student.name, registerNumber: student.register_number },
    quiz: { id: quiz.id, title: quiz.title, durationMinutes: quiz.duration_minutes, tabSwitchLimit: quiz.tab_switch_limit },
    attendanceId: attendance?.id,
  });
});

// GET /api/students/profile
const getProfile = asyncHandler(async (req, res) => {
  const { data: student, error } = await docById("students", req.student.studentId);
  if (error) throw new ApiError(500, "Failed to load profile", error.message);
  if (!student) throw new ApiError(404, "Student not found");
  res.json({ success: true, student });
});

// POST /api/students/logout
const logoutSession = asyncHandler(async (req, res) => {
  await updateDoc("students", req.student.studentId, {
    active_session_token: null,
    active_session_quiz_id: null,
    active_session_started_at: null,
  });
  res.json({ success: true, message: "Logged out. Log back in to resume this quiz." });
});

module.exports = { listPublicQuizzes, getPublicQuiz, joinQuiz, getProfile, logoutSession };
