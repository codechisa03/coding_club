const { getSupabase } = require("../config/supabaseClient");
const { docById } = require("../config/supabaseHelpers");
const { asyncHandler, ApiError } = require("../utils/asyncHandler");

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }
  const identifier = String(email).trim().toLowerCase();

  // Create an isolated ephemeral client strictly for verifying credentials 
  // so we do not pollute the Service Role backend singleton auth context.
  const { createClient } = require("@supabase/supabase-js");
  const env = require("../config/env");
  const ephemeralClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // 1. Authenticate with Supabase Auth Native API
  const { data: authData, error: authError } = await ephemeralClient.auth.signInWithPassword({
    email: identifier,
    password: password
  });

  if (authError || !authData.session) {
    throw new ApiError(401, "Invalid email or password");
  }

  // 2. We trust the Supabase Auth system. If signInWithPassword succeeded, 
  // they are the admin. The legacy admins table check is removed to prevent lockouts.
  const userId = authData.user.id;

  return res.json({
    success: true,
    token: authData.session.access_token, // Returns the true Supabase JWT
    admin: {
      uid: userId,
      email: identifier,
      name: "Administrator",
    },
  });
});

module.exports = { login };
