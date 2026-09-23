const { docById, queryDocs, addDoc, updateDoc } = require("../config/supabaseHelpers");

const { signStudentToken } = require("../utils/jwt");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const { passwordIssues } = require("../utils/passwordPolicy");
const { normalizeDepartment, normalizeSection, isValidBatch, normalizeMobileNumber } = require("../utils/enums");
const bcrypt = require("bcryptjs");


const clean = (v) => String(v ?? "").trim();

const REGISTER_NUMBER_RE = /^[0-9]{1,6}$/;

function toStudentPayload(student) {
  return {
    id: student.id,
    name: student.name,
    registerNumber: student.register_number,
    email: student.email,
    department: student.department || "",
    section: student.section || "",
    batch: student.batch || "",
    mobileNumber: student.mobile_number || "",
    bio: student.bio || "",
    avatarUrl: student.avatar_url || "",
  };
}

// POST /api/students/register
const registerAccount = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const email = clean(body.email);
  const name = clean(body.name);
  const registerNumber = clean(body.registerNumber);
  const password = String(body.password ?? "");
  const department = normalizeDepartment(body.department);
  const section = normalizeSection(body.section);
  const batch = clean(body.batch);
  const mobileNumber = normalizeMobileNumber(body.mobileNumber);

  const errors = [];
  if (!email) errors.push("Email is required");
  if (!name) errors.push("Name is required");
  if (!registerNumber) errors.push("Enrollment number is required");
  else if (!REGISTER_NUMBER_RE.test(registerNumber)) errors.push("Enrollment number must be up to 6 digits (numbers only)");
  if (!mobileNumber) errors.push("Please enter a valid 10-digit mobile number");
  if (!password) errors.push("Password is required");
  else {
    const issues = passwordIssues(password);
    if (issues.length) errors.push(...issues);
  }
  if (!department) errors.push("Please select a valid department");
  if (!section) errors.push("Please select a valid section");
  if (!batch || !isValidBatch(batch)) errors.push("Please select a valid batch (pick a start year, then an end year)");
  if (errors.length) throw new ApiError(400, "Validation failed", errors);

  // Look up by register number or email
  const { data: existingReg } = await queryDocs("students", [["register_number", "==", registerNumber]], { limit: 1 });
  if (existingReg && existingReg[0] && existingReg[0].password_hash) {
    throw new ApiError(409, "An account already exists for this enrollment number. Try signing in instead.");
  }
  const { data: existingEmail } = await queryDocs("students", [["email", "==", email]], { limit: 1 });
  if (existingEmail && existingEmail[0] && existingEmail[0].password_hash) {
    throw new ApiError(409, "An account already exists for this email. Try signing in instead.");
  }

  const existingStudent = (existingReg && existingReg[0]) || (existingEmail && existingEmail[0]);

  const password_hash = bcrypt.hashSync(password, 10);

  let student;


  if (existingStudent) {
    // Attach account to existing quiz-participation record but now using UID as the identifier logic?
    // Firestore addDoc/updateDoc doesn't let us quickly set the direct document ID unless we use set().
    // We will just update the existing document to contain the UID.
    const { error } = await updateDoc("students", existingStudent.id, {
      email,
      name,
      department,
      section,
      batch,
      mobile_number: mobileNumber,
      password_hash,
      account_created_at: new Date().toISOString(),
    });
    if (error) {
      console.error("UpdateDoc Error:", error);
      throw new ApiError(500, "Failed to create account: " + (error.message || "Unknown error"));
    }
    const { data: updated } = await docById("students", existingStudent.id);
    student = updated;
  } else {
    // Create new document with UID as the ID or just let it auto-generate and store UID inside
    // The previous implementation used auto-generated IDs for students but maybe let's stick to updateDoc/addDoc
    const { data: created, error } = await addDoc("students", {
      email,
      name: name,
      register_number: registerNumber,
      department,
      section,
      batch,
      mobile_number: mobileNumber,
      password_hash,
      bio: "",
      avatar_url: "",
      account_created_at: new Date().toISOString(),
    });
    if (error) {
      console.error("AddDoc Error:", error);
      throw new ApiError(500, "Failed to create account: " + (error.message || "Unknown error"));
    }
    student = created;
  }

  const token = signStudentToken({
    studentId: student.id,
    registerNumber: student.register_number,
    account: true,
  });

  res.status(201).json({ success: true, token, student: toStudentPayload(student) });
});

// POST /api/students/signin
const signIn = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const { data: students } = await queryDocs("students", [["email", "==", email]], { limit: 1 });
  const student = students && students[0];

  if (!student || !student.password_hash) {
    throw new ApiError(401, "Invalid email or password");
  }

  const ok = bcrypt.compareSync(password, student.password_hash);
  if (!ok) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = signStudentToken({
    studentId: student.id,
    registerNumber: student.register_number,
    account: true,
  });

  res.json({ success: true, token, student: toStudentPayload(student) });
});

// GET /api/students/account
const getAccount = asyncHandler(async (req, res) => {
  const { data: student, error } = await docById("students", req.student.studentId);
  if (error) throw new ApiError(500, "Failed to load account", error.message);
  if (!student) throw new ApiError(404, "Account not found");
  res.json({ success: true, student: toStudentPayload(student) });
});

const BIO_MAX_LENGTH = 300;
const AVATAR_MAX_BYTES = 1.5 * 1024 * 1024;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

// PUT /api/students/account
const updateAccount = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates = {};
  const errors = [];

  if (body.name !== undefined) {
    const name = clean(body.name);
    if (!name) {
      errors.push("Name is required");
    } else {
      updates.name = name;
    }
  }

  if (body.bio !== undefined) {
    const bio = String(body.bio ?? "").trim();
    if (bio.length > BIO_MAX_LENGTH) errors.push(`Bio must be ${BIO_MAX_LENGTH} characters or fewer`);
    else updates.bio = bio;
  }

  if (body.avatarUrl !== undefined) {
    const avatarUrl = String(body.avatarUrl ?? "").trim();
    if (!avatarUrl) {
      updates.avatar_url = null;
    } else {
      const match = AVATAR_DATA_URL_RE.exec(avatarUrl);
      if (!match) {
        errors.push("Photo must be a PNG, JPEG, WEBP or GIF image");
      } else {
        const approxBytes = Math.ceil((match[2].length * 3) / 4);
        if (approxBytes > AVATAR_MAX_BYTES) errors.push("Photo is too large — please use a smaller image");
        else updates.avatar_url = avatarUrl;
      }
    }
  }

  if (body.department !== undefined) {
    const raw = clean(body.department);
    if (raw) {
      const department = normalizeDepartment(raw);
      if (!department) errors.push("Please select a valid department");
      else updates.department = department;
    }
  }

  if (body.section !== undefined) {
    const raw = clean(body.section);
    if (raw) {
      const section = normalizeSection(raw);
      if (!section) errors.push("Please select a valid section");
      else updates.section = section;
    }
  }

  if (body.batch !== undefined) {
    const batch = clean(body.batch);
    if (batch) {
      if (!isValidBatch(batch)) errors.push("Please select a valid batch (pick a start year, then an end year)");
      else updates.batch = batch;
    }
  }

  if (body.mobileNumber !== undefined) {
    const raw = clean(body.mobileNumber);
    if (raw) {
      const mobileNumber = normalizeMobileNumber(raw);
      if (!mobileNumber) errors.push("Please enter a valid 10-digit mobile number");
      else updates.mobile_number = mobileNumber;
    }
  }

  if (errors.length) throw new ApiError(400, "Validation failed", errors);
  if (Object.keys(updates).length === 0) throw new ApiError(400, "Nothing to update");

  const { error } = await updateDoc("students", req.student.studentId, updates);
  if (error) {
    throw new ApiError(500, "Failed to update profile", error.message);
  }

  const { data: updated } = await docById("students", req.student.studentId);
  res.json({ success: true, student: toStudentPayload(updated) });
});

// GET /api/students/account/logout-events
const listLogoutEvents = asyncHandler(async (req, res) => {
  try {
    const { data } = await queryDocs(
      "student_logout_events",
      [["student_id", "==", req.student.studentId]],
      { orderBy: "created_at", direction: "desc", limit: 5 }
    );
    res.json({
      success: true,
      events: (data || []).map((e) => ({
        id: e.id,
        quizTitle: e.quiz_title || "",
        reason: e.reason,
        message: e.message,
        createdAt: e.created_at,
      })),
    });
  } catch {
    res.json({ success: true, events: [] });
  }
});

// PUT /api/students/account/password
const changePassword = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  const errors = [];
  if (!currentPassword) errors.push("Current password is required");
  if (!newPassword) errors.push("New password is required");
  else {
    const issues = passwordIssues(newPassword);
    if (issues.length) errors.push(...issues);
    else if (newPassword === currentPassword) errors.push("New password must be different from current password");
  }
  if (confirmPassword !== newPassword) errors.push("Passwords do not match");

  if (errors.length) throw new ApiError(400, "Validation failed", errors);

  const { data: student } = await docById("students", req.student.studentId);
  if (!student || !student.password_hash) throw new ApiError(404, "Account not found");

  const ok = bcrypt.compareSync(currentPassword, student.password_hash);
  if (!ok) throw new ApiError(401, "Incorrect current password");

  const { error } = await updateDoc("students", req.student.studentId, {
    password_hash: bcrypt.hashSync(newPassword, 10),
  });
  if (error) throw new ApiError(500, "Failed to update password", error.message);

  res.json({ success: true });
});

module.exports = { registerAccount, signIn, getAccount, updateAccount, listLogoutEvents, changePassword };

