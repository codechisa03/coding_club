const crypto = require("crypto");
const path = require("path");
const { getSupabase } = require("../config/supabaseClient");
const { queryDocs, addDoc, updateDoc, deleteDoc, countDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");
const env = require("../config/env");

const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

function mediaTypeFromMime(mime) {
  if (ALLOWED_IMAGE_MIME.includes(mime)) return "image";
  if (ALLOWED_VIDEO_MIME.includes(mime)) return "video";
  return null;
}

function toPublicMedia(row) {
  return {
    id: row.id,
    type: row.media_type,
    title: row.title,
    caption: row.caption,
    url: row.url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

// GET /api/admin/media
const listMedia = asyncHandler(async (req, res) => {
  const { data, error } = await queryDocs("landing_media", [], { orderBy: "sort_order", direction: "asc" });
  if (error) throw new ApiError(500, "Failed to load landing media", error.message);
  res.json({ success: true, media: (data || []).map(toPublicMedia) });
});

// POST /api/admin/media
const uploadMedia = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No file uploaded");

  const mediaType = mediaTypeFromMime(file.mimetype);
  if (!mediaType) throw new ApiError(400, "Unsupported file type. Upload an image (PNG, JPEG, WEBP, GIF) or a video (MP4, WEBM, OGG, MOV).");

  const maxMb = mediaType === "image" ? env.LANDING_MEDIA_IMAGE_MAX_MB : env.LANDING_MEDIA_VIDEO_MAX_MB;
  if (file.size > maxMb * 1024 * 1024) throw new ApiError(413, `File too large. The limit for ${mediaType}s is ${maxMb}MB.`);

  const ext = (path.extname(file.originalname || "") || "").slice(0, 10);
  const storagePath = `${mediaType}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  const bucketName = env.LANDING_MEDIA_BUCKET_PREFIX || "landing-media";
  const supabase = getSupabase();
  
  // Auto-create bucket if missing
  const { error: bucketError } = await supabase.storage.getBucket(bucketName);
  if (bucketError && bucketError.message.includes("Bucket not found")) {
    await supabase.storage.createBucket(bucketName, { public: true });
  }

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (uploadError) {
    throw new ApiError(500, "Failed to upload file to storage", uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(storagePath);
  
  const url = publicUrlData.publicUrl;

  const existingCount = await countDocs("landing_media");

  const title = String(req.body?.title || "").trim().slice(0, 200) || null;
  const caption = String(req.body?.caption || "").trim().slice(0, 500) || null;

  const { data: row, error: insertError } = await addDoc("landing_media", {
    media_type: mediaType,
    title,
    caption,
    storage_path: storagePath,
    url,
    mime_type: file.mimetype,
    file_size_bytes: file.size,
    sort_order: existingCount,
    is_active: true,
  });

  if (insertError) {
    // Best-effort cleanup
    await supabase.storage.from(bucketName).remove([storagePath]).catch(() => {});
    throw new ApiError(500, "Failed to save media record", insertError.message);
  }

  res.status(201).json({ success: true, media: toPublicMedia(row) });
});

// PATCH /api/admin/media/:id
const updateMedia = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates = {};
  if (body.title !== undefined) updates.title = String(body.title || "").trim().slice(0, 200) || null;
  if (body.caption !== undefined) updates.caption = String(body.caption || "").trim().slice(0, 500) || null;
  if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

  const { error } = await updateDoc("landing_media", req.params.id, updates);
  if (error) throw new ApiError(500, "Failed to update media item", error.message);

  const { data } = await import("../config/supabaseHelpers").then((m) => m.docById("landing_media", req.params.id));
  if (!data) throw new ApiError(404, "Media item not found");
  res.json({ success: true, media: toPublicMedia(data) });
});

// PUT /api/admin/media/reorder
const reorderMedia = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new ApiError(400, "orderedIds must be a non-empty array of media ids");
  }
  await Promise.all(
    orderedIds.map((id, idx) => updateDoc("landing_media", id, { sort_order: idx }))
  );
  res.json({ success: true, message: "Media order updated" });
});

// DELETE /api/admin/media/:id
const deleteMedia = asyncHandler(async (req, res) => {
  const { docById: getDoc } = require("../config/supabaseHelpers");
  const { data: row, error: fetchError } = await getDoc("landing_media", req.params.id);
  if (fetchError) throw new ApiError(500, "Failed to load media item", fetchError.message);
  if (!row) throw new ApiError(404, "Media item not found");

  const { error: deleteError } = await deleteDoc("landing_media", req.params.id);
  if (deleteError) throw new ApiError(500, "Failed to delete media item", deleteError.message);

  if (row.storage_path) {
    const supabase = getSupabase();
    const bucketName = env.LANDING_MEDIA_BUCKET_PREFIX || "landing-media";
    await supabase.storage.from(bucketName).remove([row.storage_path]).catch(() => {});
  }

  res.json({ success: true, message: "Media item deleted" });
});

module.exports = { listMedia, uploadMedia, updateMedia, reorderMedia, deleteMedia };
