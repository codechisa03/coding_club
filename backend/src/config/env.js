require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,

  // ── Supabase (Database) ─────────────────────────────────────────────────
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_JWKS_URL: required("SUPABASE_JWKS_URL"),

  JWT_SECRET: required("JWT_SECRET", "change-this-secret-in-production"),
  JWT_ADMIN_EXPIRES_IN: process.env.JWT_ADMIN_EXPIRES_IN || "8h",
  JWT_STUDENT_EXPIRES_IN: process.env.JWT_STUDENT_EXPIRES_IN || "12h",

  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",

  // Landing Media: images/videos stored in Firebase Storage.
  LANDING_MEDIA_BUCKET_PREFIX: process.env.LANDING_MEDIA_BUCKET_PREFIX || "landing-media",
  LANDING_MEDIA_IMAGE_MAX_MB: Number(process.env.LANDING_MEDIA_IMAGE_MAX_MB) || 8,
  LANDING_MEDIA_VIDEO_MAX_MB: Number(process.env.LANDING_MEDIA_VIDEO_MAX_MB) || 60,

  // Sandboxed code execution for programming questions.
  CODE_EXEC_ENABLED: process.env.CODE_EXEC_ENABLED || "true",
  CODE_EXEC_PROVIDER: process.env.CODE_EXEC_PROVIDER || "auto",
  CODE_EXEC_URL: process.env.CODE_EXEC_URL || "",
  CODE_EXEC_TOKEN: process.env.CODE_EXEC_TOKEN || "",
  CODE_EXEC_TIMEOUT: Number(process.env.CODE_EXEC_TIMEOUT) || 15000,
  CODE_EXEC_FALLBACK: process.env.CODE_EXEC_FALLBACK || "wandbox",
  WANDBOX_URL: process.env.WANDBOX_URL || "https://wandbox.org/api/compile.json",
  WANDBOX_COMPILERS: process.env.WANDBOX_COMPILERS || "",

  // Email (SMTP for certificates)
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: Number(process.env.SMTP_PORT) || 465,
  SMTP_SECURE: process.env.SMTP_SECURE !== "false",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "",
};

module.exports = env;
