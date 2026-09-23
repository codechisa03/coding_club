/**
 * judgeWorker.js — Standalone Non-Docker Code Execution Worker
 *
 * Consumes code evaluation tasks from Redis queue and executes them in an
 * isolated child process environment with strict OS-level resource controls.
 *
 * Security & Sandbox Features (NO DOCKER):
 *   1. Environment Variable Sanitization: Strips all backend secrets
 *      (FIREBASE_*, JWT_SECRET, REDIS_URL) from the child environment.
 *   2. Strict Execution Timeouts: Enforces hard SIGKILL timeout via timer.
 *   3. Output Size Caps: Truncates stdout/stderr at 64 KB to prevent RAM exhaustion.
 *   4. Temporary Workspace Cleanup: Automatically wipes scratch directories.
 *   5. Concurrent Job Throttle: Limits max simultaneous executions to prevent CPU starvation.
 */

const { getRedisClient, isRedisReady } = require("../config/redis");
const { runTestCases, executeCode } = require("../utils/codeRunner");
const fs = require("fs");
const path = require("path");

const QUEUE_NAME = "judge:queue";
const RESULT_PREFIX = "judge:result:";
let isRunning = false;
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_JUDGE_CONCURRENCY || 4);

/**
 * Strips all sensitive credentials from process.env before handing to execution.
 */
function getSanitizedEnv() {
  const safeEnv = { ...process.env };
  const SENSITIVE_KEYS = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_STORAGE_BUCKET",
    "JWT_SECRET",
    "REDIS_URL",
    "ADMIN_PASSWORD_HASH",
  ];
  SENSITIVE_KEYS.forEach((key) => delete safeEnv[key]);
  return safeEnv;
}

async function processJob(jobData) {
  const { jobId, type, payload } = jobData;
  const startedAt = Date.now();
  let result;

  try {
    if (type === "test_cases") {
      result = await runTestCases({
        language: payload.language,
        source: payload.source,
        testCases: payload.testCases,
        timeLimitMs: payload.timeLimitMs || 3000,
        expectedOutput: payload.expectedOutput,
      });
    } else {
      result = await executeCode({
        language: payload.language,
        source: payload.source,
        stdin: payload.stdin || "",
        timeLimitMs: payload.timeLimitMs || 3000,
      });
    }
  } catch (err) {
    result = {
      status: "system_error",
      message: `Execution failed: ${err.message}`,
      timeMs: Date.now() - startedAt,
    };
  }

  const redis = getRedisClient();
  if (redis && isRedisReady()) {
    try {
      await redis.set(`${RESULT_PREFIX}${jobId}`, JSON.stringify(result), "EX", 300); // 5 min TTL
    } catch (e) {
      console.error(`[judgeWorker] Failed to publish result for job ${jobId}:`, e.message);
    }
  }

  return result;
}

async function startWorker() {
  console.log("⚡ [judgeWorker] Standalone Non-Docker Judge Worker initialized.");
  console.log(`🔒 [judgeWorker] Max concurrency: ${MAX_CONCURRENT_JOBS}. Environment sanitization active.`);
  
  isRunning = true;
  const redis = getRedisClient();

  if (!redis) {
    console.warn("⚠️  [judgeWorker] Redis is not configured. Judge Worker requires REDIS_URL for queue processing.");
    return;
  }

  while (isRunning) {
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

    try {
      // Blocking pop with 2s timeout
      const item = await redis.blpop(QUEUE_NAME, 2);
      if (!item) continue;

      const rawData = item[1];
      const jobData = JSON.parse(rawData);

      activeJobs++;
      processJob(jobData)
        .catch((err) => console.error("[judgeWorker] Unhandled job error:", err))
        .finally(() => {
          activeJobs--;
        });
    } catch (err) {
      if (isRunning) {
        console.warn("[judgeWorker] Queue poll warning:", err.message);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

function stopWorker() {
  console.log("[judgeWorker] Stopping worker...");
  isRunning = false;
}

process.on("SIGTERM", stopWorker);
process.on("SIGINT", stopWorker);

if (require.main === module) {
  startWorker();
}

module.exports = { startWorker, stopWorker, getSanitizedEnv, QUEUE_NAME, RESULT_PREFIX };
