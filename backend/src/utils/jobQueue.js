const crypto = require("crypto");
const { getRedisClient, isRedisReady } = require("../config/redis");
const { QUEUE_NAME, RESULT_PREFIX } = require("../workers/judgeWorker");
// Note: We'll need to decouple RESULT_PREFIX from judgeWorker to allow api instances 
// to use it without importing the worker itself (which has standalone side-effects).
// We'll define them here and we should update judgeWorker to use this if needed, 
// or simply duplicate the constants temporarily.

const ACTIVE_QUEUE_NAME = "judge:queue";
const ACTIVE_RESULT_PREFIX = "judge:result:";

/**
 * Pushes a job to the Redis queue and waits for a worker to process it.
 * This ensures the main API thread remains fully stateless and unblocked.
 * 
 * @param {string} type - 'test_cases' or 'run'
 * @param {object} payload - Source code and execution configuration
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<object>} The judge result
 */
async function dispatchJudgeJob(type, payload, signal) {
  const redis = getRedisClient();
  
  if (!redis || !isRedisReady()) {
    throw new Error("Redis is unreachable. Distributed code judge requires Redis to be active.");
  }

  const jobId = crypto.randomUUID();
  const resultKey = `${ACTIVE_RESULT_PREFIX}${jobId}`;
  
  const jobData = {
    jobId,
    type,
    payload,
    timestamp: Date.now()
  };

  // Push to queue
  await redis.rpush(ACTIVE_QUEUE_NAME, JSON.stringify(jobData));

  // Wait for result by polling the result key.
  // In a high-traffic production system we would use Redis Pub/Sub (keyspace notifications)
  // or blpop on a specific reply queue, but polling a specific key is perfectly horizontally scalable.
  const timeoutMs = typeof payload.timeLimitMs === 'number' ? payload.timeLimitMs + 15000 : 25000;
  const start = Date.now();
  
  return new Promise((resolve, reject) => {
    const handleAbort = async () => {
      resolve({ status: "aborted", message: "Stopped by the student" });
    };

    if (signal) {
      if (signal.aborted) return handleAbort();
      signal.addEventListener("abort", handleAbort, { once: true });
    }

    const pollInterval = setInterval(async () => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(pollInterval);
        if (signal) signal.removeEventListener("abort", handleAbort);
        resolve({
          status: "judge_unavailable",
          message: "The judge did not respond in time (Timeout)."
        });
        return;
      }

      try {
        const resultString = await redis.get(resultKey);
        if (resultString) {
          clearInterval(pollInterval);
          if (signal) signal.removeEventListener("abort", handleAbort);
          
          // Cleanup result key early
          await redis.del(resultKey).catch(() => {});
          
          resolve(JSON.parse(resultString));
        }
      } catch (e) {
        // Ignore transient Redis get errors during polling
      }
    }, 500); // Poll every 500ms
  });
}

module.exports = {
  dispatchJudgeJob,
  QUEUE_NAME: ACTIVE_QUEUE_NAME,
  RESULT_PREFIX: ACTIVE_RESULT_PREFIX
};
