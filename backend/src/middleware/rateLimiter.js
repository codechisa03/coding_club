const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { getRedisClient, isRedisReady } = require("../config/redis");
const env = require("../config/env");

function createLimiter({ windowMs, max, prefix = "rl:" }) {
  const redisClient = getRedisClient();
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  };

  if (redisClient && isRedisReady()) {
    try {
      options.store = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix,
      });
    } catch (err) {
      console.warn(`[rate-limiter] failed to create Redis store for ${prefix}, falling back to memory:`, err.message);
    }
  }

  return rateLimit(options);
}

const generalLimiter = createLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.GENERAL_RATE_LIMIT || 300),
  prefix: "rl:gen:",
});

const authLimiter = createLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  prefix: "rl:auth:",
});

module.exports = { generalLimiter, authLimiter, createLimiter };
