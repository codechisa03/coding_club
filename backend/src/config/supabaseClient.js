const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

let supabaseInstance = null;

function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    if (env.NODE_ENV === "test") {
      throw new Error("Supabase is missing setup in test/env.");
    }
    throw new Error(
      "FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env!\n" +
      "Make sure your backend/.env file has these values set correctly."
    );
  }

  supabaseInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseInstance;
}

module.exports = { getSupabase };
