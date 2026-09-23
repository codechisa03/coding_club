const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const env = require("./config/env");
const { closeRedis, isRedisReady } = require("./config/redis");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const compression = require("./middleware/compression");
const requestIdMiddleware = require("./middleware/requestId");
const { generalLimiter, authLimiter } = require("./middleware/rateLimiter");
const { initRealtime } = require("./realtime");

const adminRoutes = require("./routes/admin");
const studentRoutes = require("./routes/students");
const quizRoutes = require("./routes/quizzes");
const playgroundRoutes = require("./routes/playground");
const studentResultsRoutes = require("./routes/studentResults");
const mediaRoutes = require("./routes/media");

process.on("unhandledRejection", (reason) => {
  console.error("[unhandled rejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaught exception]", err);
});

const app = express();

app.set("trust proxy", 1);
app.use(requestIdMiddleware);
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  })
);

app.use(express.json({ limit: "3mb" }));

if (env.NODE_ENV !== "test") {
  // Morgan format including Request ID
  morgan.token("req-id", (req) => req.id || "-");
  app.use(
    morgan(
      env.NODE_ENV === "production"
        ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" req-id=:req-id'
        : ":method :url :status :response-time ms - req-id=:req-id"
    )
  );
}

// Rate limiting (Redis-backed when REDIS_URL is configured)
app.use("/api", generalLimiter);
app.use("/api/admin/login", authLimiter);
app.use("/api/students/login", authLimiter);
app.use("/api/students/register", authLimiter);
app.use("/api/students/signin", authLimiter);
app.use("/api/students/account/password", authLimiter);

// Health & Readiness checks
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "coding-club-api",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    requestId: req.id,
  });
});

app.get("/api/ready", (req, res) => {
  const supabaseReady = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const status = supabaseReady ? "ready" : "degraded";

  res.status(supabaseReady ? 200 : 503).json({
    status,
    supabaseConfigured: supabaseReady,
    redisReady: isRedisReady(),
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

app.use("/api/admin", adminRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/student/results", studentResultsRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/playground", playgroundRoutes);
app.use("/api/media", mediaRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);

// Socket.IO — admin-only realtime channel with optional Redis adapter
const io = initRealtime(
  httpServer,
  env.CORS_ORIGIN.split(",").map((o) => o.trim())
);

const PORT = process.env.PORT || env.PORT || 5000;

const server = httpServer.listen(PORT, () => {
  console.log(`Quiz Assessment API listening on port ${PORT} (req-tracing enabled)`);
  // Judge runtime warmup is now strictly delegated to standalone Judge Workers.
  // The API server remains untethered to execution workloads.

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — database routes will fail until backend/.env is configured."
    );
  }
});

// Graceful Shutdown handling
function gracefulShutdown(signal) {
  console.log(`\n[server] ${signal} received — starting graceful shutdown...`);
  
  server.close(async () => {
    console.log("[server] HTTP server closed. Cleaning up resources...");
    
    // Close Socket.IO connections gracefully before dropping Redis cache and queues
    if (io) {
      io.close(() => console.log("[server] Realtime connections severed gracefully."));
    }
    
    try {
      await closeRedis();
      console.log("[server] Redis connections closed.");
    } catch (err) {
      console.error("[server] Error closing Redis:", err.message);
    }
    console.log("[server] Shutdown complete. Exiting.");
    process.exit(0);
  });

  // Force shutdown after 10 seconds if connections refuse to close
  setTimeout(() => {
    console.error("[server] Forced shutdown timeout reached (10s). Exiting.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;
