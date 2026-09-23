const { getSupabase } = require("../config/supabaseClient");
const { verifyToken } = require("../utils/jwt");
const { ApiError } = require("../utils/asyncHandler");

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

async function requireAdmin(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next(new ApiError(401, "Missing admin token"));
  
  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data.user) {
      throw new Error(error?.message || "Invalid token");
    }
    
    // In this app, only the platform owner uses Supabase Auth.
    // A valid Supabase Auth JWT string implies Admin access natively.
    req.admin = {
      id: data.user.id,
      email: data.user.email,
      role: "admin"
    };
    next();
  } catch (err) {
    console.error("ADMIN AUTH ERROR:", err);
    next(new ApiError(401, "Invalid or expired admin session"));
  }
}

function requireStudent(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next(new ApiError(401, "Missing student session token"));
  try {
    const payload = verifyToken(token);
    if (payload.role !== "student") {
      return next(new ApiError(403, "Student access required"));
    }
    req.student = payload;
    next();
  } catch (err) {
    next(new ApiError(401, "Invalid or expired quiz session"));
  }
}

// Session lock: verify the student's active_session_token hasn't been replaced by a newer login.
async function requireActiveQuizSession(req, res, next) {
  try {
    if (!req.student?.sessionToken) return next();

    const { data: student } = await docById("students", req.student.studentId);
    if (!student) return next();

    if (student.active_session_token && student.active_session_token !== req.student.sessionToken) {
      return next(
        new ApiError(
          401,
          "This Register Number signed in from another session. Log in again here to resume this quiz."
        )
      );
    }
    next();
  } catch {
    next(); // Fail open — never block a valid quiz attempt over an infra error
  }
}

module.exports = { requireAdmin, requireStudent, requireActiveQuizSession };
