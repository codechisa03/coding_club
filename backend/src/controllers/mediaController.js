const { queryDocs } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const listLandingMedia = asyncHandler(async (req, res) => {
  const { data, error } = await queryDocs("landing_media", [["is_active", "==", true]], {
    orderBy: "sort_order",
    direction: "asc",
  });
  if (error) throw new ApiError(500, "Failed to load landing media", error.message);

  res.json({
    success: true,
    media: (data || []).map((row) => ({
      id: row.id,
      type: row.media_type,
      title: row.title,
      caption: row.caption,
      url: row.url,
    })),
  });
});

module.exports = { listLandingMedia };
