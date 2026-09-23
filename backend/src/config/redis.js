/**
 * redis.js
 *
 * Resilient Redis configuration for distributed caching, rate limiting, and
 * Socket.IO multi-instance pub/sub. Operates gracefully if REDIS_URL is not set
 * or if the Redis server is temporarily unreachable.
 */

const Redis = require("ioredis");
const env = require("./env");

let redisClient = null;
let isConnected = false;

function createRedisClient(options = {}) {
  const redisUrl = process.env.REDIS_URL || env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      ...options,
    });

    client.on("connect", () => {
      isConnected = true;
    });

    client.on("error", (err) => {
      isConnected = false;
      if (env.NODE_ENV !== "test") {
        console.warn("[redis] connection warning:", err.message);
      }
    });

    return client;
  } catch (err) {
    console.warn("[redis] failed to instantiate client:", err.message);
    return null;
  }
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient();
    if (redisClient) {
      redisClient.connect().catch((err) => {
        console.warn("[redis] initial connect failed:", err.message);
      });
    }
  }
  return redisClient;
}

function isRedisReady() {
  return Boolean(redisClient && redisClient.status === "ready");
}

async function cacheGet(key) {
  const client = getRedisClient();
  if (!client || client.status !== "ready") return null;
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = 30) {
  const client = getRedisClient();
  if (!client || client.status !== "ready") return false;
  try {
    const str = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.set(key, str, "EX", ttlSeconds);
    } else {
      await client.set(key, str);
    }
    return true;
  } catch {
    return false;
  }
}

async function cacheDel(key) {
  const client = getRedisClient();
  if (!client || client.status !== "ready") return false;
  try {
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}

async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
    isConnected = false;
  }
}

module.exports = {
  createRedisClient,
  getRedisClient,
  isRedisReady,
  cacheGet,
  cacheSet,
  cacheDel,
  closeRedis,
};
