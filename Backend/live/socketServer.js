import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { isOriginAllowed } from "../utils/allowedOrigins.js";
import { getRedisClient, isRedisConfigured } from "../utils/redisClient.js";
import { SESSION_INVALIDATE_CHANNEL } from "../utils/sessionStore.js";
import { authenticateSocket } from "./socketAuth.js";
import { canAccessModule } from "../middleware/team.permissions.js";
import { presenceRoom, broadcastPresence } from "./presence.js";
import { acquireLock, releaseLock, refreshLock, getLock } from "./locks.js";

// Presence + soft-lock live collaboration (v1 scope - see the conversation:
// full CRDT/OT real-time editing is an explicitly deferred phase 2+).
// Everything is scoped by accountId (the shared team account, same id
// resources are scoped by everywhere else - see teamContext.js) so members
// of different teams never see each other's presence/locks even though
// resourceIds are globally unique cuids.

const RESOURCE_TYPE_TO_MODULE = {
    product: "products",
    category: "categories",
    unit: "units",
    customer: "customers",
    supplier: "suppliers",
    order: "orders",
    purchase: "purchases",
};

const isValidResourceRef = ({ resourceType, resourceId }) =>
    typeof resourceType === "string" &&
    RESOURCE_TYPE_TO_MODULE[resourceType] &&
    typeof resourceId === "string" &&
    resourceId.length > 0 &&
    resourceId.length < 100;

// Every member of an account joins this the moment they connect (unlike the
// presence rooms above, which are joined per-record on demand) so
// live/dataEvents.js can broadcast "this list may be stale" without needing
// to know who's looking at what - see the multi-user concurrency audit
// (2026-08-20), which found no mutation ever reached connected users.
export const accountRoom = (accountId) => `account:${accountId}`;

let ioInstance = null;
export const getIO = () => ioInstance;

export const initSocketServer = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (isOriginAllowed(origin)) return callback(null, true);
                return callback(new Error("Not allowed by CORS"));
            },
            credentials: true,
        },
        // Match the REST API's URL shape (/api/v1/...) so both sit behind
        // the same reverse-proxy path rules on Render.
        path: "/api/v1/socket.io",
    });

    if (isRedisConfigured()) {
        const pubClient = getRedisClient().duplicate();
        const subClient = pubClient.duplicate();
        io.adapter(createAdapter(pubClient, subClient));
    } else {
        console.warn(
            "[live] REDIS_URL not configured - presence/locks work but only within a single server instance."
        );
    }

    io.use(async (socket, next) => {
        try {
            socket.data.user = await authenticateSocket(socket);
            next();
        } catch (err) {
            next(new Error(err.message || "Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const { user } = socket.data;
        socket.data.rooms = new Set();
        socket.data.locks = new Set();
        socket.join(accountRoom(user.accountId));

        const resourceRoom = ({ resourceType, resourceId }) =>
            presenceRoom(user.accountId, resourceType, resourceId);

        socket.on("presence:join", async ({ resourceType, resourceId } = {}, ack) => {
            if (!isValidResourceRef({ resourceType, resourceId })) {
                return ack?.({ ok: false, error: "Invalid resource reference" });
            }
            const moduleKey = RESOURCE_TYPE_TO_MODULE[resourceType];
            if (!(await canAccessModule(user, moduleKey, "view"))) {
                return ack?.({ ok: false, error: "No access to this module" });
            }

            const room = resourceRoom({ resourceType, resourceId });
            socket.join(room);
            socket.data.rooms.add(room);

            const [viewers, lock] = await Promise.all([
                broadcastPresence(io, room),
                getLock({ accountId: user.accountId, resourceType, resourceId }),
            ]);

            ack?.({ ok: true, viewers, lock });
        });

        socket.on("presence:leave", async ({ resourceType, resourceId } = {}) => {
            if (!isValidResourceRef({ resourceType, resourceId })) return;
            const room = resourceRoom({ resourceType, resourceId });
            socket.leave(room);
            socket.data.rooms.delete(room);
            await broadcastPresence(io, room);
        });

        socket.on("lock:acquire", async ({ resourceType, resourceId } = {}, ack) => {
            if (!isValidResourceRef({ resourceType, resourceId })) {
                return ack?.({ ok: false, error: "Invalid resource reference" });
            }
            const moduleKey = RESOURCE_TYPE_TO_MODULE[resourceType];
            if (!(await canAccessModule(user, moduleKey, "edit"))) {
                return ack?.({ ok: false, error: "No edit access to this module" });
            }

            const result = await acquireLock({
                accountId: user.accountId,
                resourceType,
                resourceId,
                holder: { userId: user.id, username: user.username, avatar: user.avatar },
            });

            const lockKeyId = `${resourceType}:${resourceId}`;
            if (result.acquired) {
                socket.data.locks.add(lockKeyId);
            }

            io.to(resourceRoom({ resourceType, resourceId })).emit("lock:update", {
                resourceType,
                resourceId,
                locked: true,
                holder: result.holder,
            });

            ack?.(result);
        });

        socket.on("lock:heartbeat", async ({ resourceType, resourceId } = {}, ack) => {
            if (!isValidResourceRef({ resourceType, resourceId })) return ack?.({ ok: false });
            const ok = await refreshLock({ accountId: user.accountId, resourceType, resourceId, userId: user.id });
            ack?.({ ok });
        });

        socket.on("lock:release", async ({ resourceType, resourceId } = {}, ack) => {
            if (!isValidResourceRef({ resourceType, resourceId })) return ack?.({ ok: false });
            const released = await releaseLock({
                accountId: user.accountId,
                resourceType,
                resourceId,
                userId: user.id,
            });
            if (released) {
                socket.data.locks.delete(`${resourceType}:${resourceId}`);
                io.to(resourceRoom({ resourceType, resourceId })).emit("lock:update", {
                    resourceType,
                    resourceId,
                    locked: false,
                    holder: null,
                });
            }
            ack?.({ ok: released });
        });

        socket.on("disconnect", async () => {
            for (const lockKeyId of socket.data.locks) {
                const [resourceType, resourceId] = lockKeyId.split(":");
                const released = await releaseLock({
                    accountId: user.accountId,
                    resourceType,
                    resourceId,
                    userId: user.id,
                });
                if (released) {
                    io.to(resourceRoom({ resourceType, resourceId })).emit("lock:update", {
                        resourceType,
                        resourceId,
                        locked: false,
                        holder: null,
                    });
                }
            }
            for (const room of socket.data.rooms) {
                await broadcastPresence(io, room);
            }
        });
    });

    // A login/logout elsewhere publishes here (see sessionStore.js) - drop
    // this user's live connections whose sid no longer matches instead of
    // waiting for their next REST call to discover the session is gone.
    if (isRedisConfigured()) {
        const sessionSub = getRedisClient().duplicate();
        sessionSub.subscribe(SESSION_INVALIDATE_CHANNEL).catch((err) =>
            console.error("[live] Failed to subscribe to session-invalidate channel:", err?.message)
        );
        sessionSub.on("message", (channel, message) => {
            if (channel !== SESSION_INVALIDATE_CHANNEL) return;
            let payload;
            try {
                payload = JSON.parse(message);
            } catch {
                return;
            }
            for (const socket of io.sockets.sockets.values()) {
                if (socket.data.user?.id === payload.userId && socket.data.user?.sid !== payload.sid) {
                    // Only an actual takeover (reason "login") deserves the
                    // "signed out because you logged in elsewhere" toast - a
                    // plain logout should just drop the connection quietly.
                    if (payload.reason === "login") {
                        socket.emit("session:replaced");
                    }
                    socket.disconnect(true);
                }
            }
        });
    }

    ioInstance = io;
    return io;
};
