const { queryDocs, addDoc, updateDoc, deleteDoc, countDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const MIGRATION_HINT = "Rounds are not enabled on this database yet. Run the Firebase setup to create the 'rounds' collection.";

function roundShape(r, questionCount) {
  return {
    id: r.id,
    quizId: r.quiz_id,
    name: r.name,
    description: r.description || "",
    order: r.order_index,
    qualificationPercentage: Number(r.qualification_percentage || 0),
    questionCount: questionCount ?? 0,
  };
}

function parseQualification(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(400, "Qualification percentage must be a number");
  if (n < 0 || n > 100) throw new ApiError(400, "Qualification percentage must be between 0 and 100");
  return Math.round(n * 100) / 100;
}

// GET /api/admin/quizzes/:quizId/rounds
const listRounds = asyncHandler(async (req, res) => {
  const { data, error } = await queryDocs("rounds", [["quiz_id", "==", req.params.quizId]], {
    orderBy: "order_index",
    direction: "asc",
  });
  if (error) return res.json({ success: true, rounds: [], supported: false, message: MIGRATION_HINT });

  const { data: questions } = await queryDocs("questions", [["quiz_id", "==", req.params.quizId]]);
  const counts = new Map();
  (questions || []).forEach((q) => {
    if (!q.round_id) return;
    counts.set(q.round_id, (counts.get(q.round_id) || 0) + 1);
  });

  res.json({
    success: true,
    supported: true,
    qualificationSupported: true,
    rounds: (data || []).map((r) => roundShape(r, counts.get(r.id) || 0)),
  });
});

// POST /api/admin/quizzes/:quizId/rounds
const createRound = asyncHandler(async (req, res) => {
  const { name, description, qualificationPercentage } = req.body || {};
  if (!name || !String(name).trim()) throw new ApiError(400, "Round name is required");
  const qualification = qualificationPercentage === undefined || qualificationPercentage === null || qualificationPercentage === "" ? 0 : parseQualification(qualificationPercentage);

  const existingCount = await countDocs("rounds", [["quiz_id", "==", req.params.quizId]]);

  const { data, error } = await addDoc("rounds", {
    quiz_id: req.params.quizId,
    name: String(name).trim(),
    description: description ? String(description).trim() : null,
    order_index: existingCount,
    qualification_percentage: qualification,
  });
  if (error) throw new ApiError(500, "Failed to create round", error.message);
  res.status(201).json({ success: true, round: roundShape(data, 0) });
});

// PUT /api/admin/rounds/:id
const updateRound = asyncHandler(async (req, res) => {
  const { name, description, qualificationPercentage } = req.body || {};
  const fields = {};

  if (qualificationPercentage !== undefined) {
    fields.qualification_percentage = qualificationPercentage === null || qualificationPercentage === "" ? 0 : parseQualification(qualificationPercentage);
  }
  if (name !== undefined) {
    if (!String(name).trim()) throw new ApiError(400, "Round name is required");
    fields.name = String(name).trim();
  }
  if (description !== undefined) fields.description = description ? String(description).trim() : null;
  if (!Object.keys(fields).length) throw new ApiError(400, "Nothing to update");

  const { error } = await updateDoc("rounds", req.params.id, fields);
  if (error) throw new ApiError(500, "Failed to update round", error.message);

  const { data } = await import("../config/supabaseHelpers").then((m) => m.docById("rounds", req.params.id));
  if (!data) throw new ApiError(404, "Round not found");

  const questionCount = await countDocs("questions", [["round_id", "==", req.params.id]]);
  res.json({ success: true, round: roundShape(data, questionCount) });
});

// DELETE /api/admin/rounds/:id
const deleteRound = asyncHandler(async (req, res) => {
  // Unassign questions from this round (set round_id = null)
  const { data: questions } = await queryDocs("questions", [["round_id", "==", req.params.id]]);
  for (const q of (questions || [])) {
    await updateDoc("questions", q.id, { round_id: null }).catch(() => {});
  }
  const { error } = await deleteDoc("rounds", req.params.id);
  if (error) throw new ApiError(500, "Failed to delete round", error.message);
  res.json({ success: true, message: "Round deleted. Its questions moved to Unassigned." });
});

// PUT /api/admin/quizzes/:quizId/rounds/reorder
const reorderRounds = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || !orderedIds.length) throw new ApiError(400, "orderedIds must be a non-empty array of round ids");
  await Promise.all(orderedIds.map((id, idx) => updateDoc("rounds", id, { order_index: idx })));
  res.json({ success: true, message: "Round order updated" });
});

module.exports = { listRounds, createRound, updateRound, deleteRound, reorderRounds };
