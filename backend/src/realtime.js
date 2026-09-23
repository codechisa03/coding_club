const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { getSupabase } = require("./config/supabaseClient");
const { createRedisClient } = require("./config/redis");

let io = null;

/**
 * Real-time channel for the Admin Portal.
 * Supports multi-instance cross-server broadcasting via Redis pub/sub adapter.
 */
function initRealtime(httpServer, origins) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: origins, credentials: true },
  });

  // Attach Redis adapter if REDIS_URL is configured
  const pubClient = createRedisClient();
  if (pubClient) {
    const subClient = pubClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log("[socket.io] Redis adapter connected — multi-instance pub/sub active.");
      })
      .catch((err) => {
        console.warn("[socket.io] Redis adapter setup failed, falling back to local memory:", err.message);
      });
  }

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Missing admin token"));
    try {
      const { data, error } = await getSupabase().auth.getUser(token);
      if (error || !data.user) throw new Error("Invalid token");
      
      // Valid Supabase JWT means it's an admin (since only the owner logs in here)
      socket.data.admin = {
        id: data.user.id,
        email: data.user.email
      };
      next();
    } catch {
      next(new Error("Invalid or expired admin session"));
    }
  });

  io.on("connection", (socket) => {
    socket.join("admins");
  });

  return io;
}

/** Broadcast an event to every connected admin (works across all API instances when Redis adapter is active). */
function emitAdmin(event, payload) {
  if (!io) return;
  try {
    io.to("admins").emit(event, payload);
  } catch {
    // never let a realtime failure break an HTTP request
  }
}

module.exports = { initRealtime, emitAdmin };
