import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { prisma } from "../db/prisma.js";
import { isOriginAllowed } from "../utils/allowedOrigins.js";
import { getRedisClient, isRedisConfigured } from "../utils/redisClient.js";
import { SESSION_INVALIDATE_CHANNEL } from "../utils/sessionStore.js";
import { POS_SCOPE_INVALIDATE_CHANNEL } from "../utils/posScopeStore.js";
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

// One room per (account, PointOfSale) - a socket only joins the ones within
// its own posScope (see joinPosRoomsForUser below), so emitPosEvent
// (dataEvents.js) reaches exactly the users allowed to see that location,
// never "everyone on the account, trust the client to filter".
export const posRoom = (accountId, pointOfSaleId) => `pos:${accountId}:${pointOfSaleId}`;

// Every platform admin (role: "admin") joins this on connect - the one room
// with no account boundary, mirroring the platform-wide "Sesiones" tab
// itself (see user.controller.js's listAllSessionsAdmin). Only session
// changes broadcast here for now (see sessionStore.js); extend the same way
// if another admin-only screen ever needs live refresh across accounts.
export const platformAdminRoom = () => "admin:platform";

// Joins every Point of Sale room within this socket's scope. Full-scope
// actors (owner, or a member with posScopeAll) join every room the account
// currently has - see POS_SCOPE_INVALIDATE_CHANNEL below for what happens
// when a new one is created afterwards, since a socket can't know about a
// room that didn't exist yet when it connected.
const joinPosRoomsForUser = async (socket, user) => {
    const pointOfSaleIds = user.posScopeAll
        ? (
              await prisma.pointOfSale.findMany({
                  where: { accountId: user.accountId, isActive: true },
                  select: { id: true },
              })
          ).map((pos) => pos.id)
        : user.posScopeIds || [];

    for (const pointOfSaleId of pointOfSaleIds) {
        const room = posRoom(user.accountId, pointOfSaleId);
        socket.join(room);
        socket.data.posRooms.add(room);
    }
};

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

    io.on("connection", async (socket) => {
        const { user } = socket.data;
        socket.data.rooms = new Set();
        socket.data.locks = new Set();
        socket.data.posRooms = new Set();
        socket.data.focusedField = null;
        socket.join(accountRoom(user.accountId));
        if (user.role === "admin") {
            socket.join(platformAdminRoom());
        }
        await joinPosRoomsForUser(socket, user);

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
            // Starting fresh in this room - a field focused on whatever
            // resource this socket had open before shouldn't leak in here.
            socket.data.focusedField = null;

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
            socket.data.focusedField = null;
            await broadcastPresence(io, room);
        });

        // Field-level presence: which form field this socket currently has
        // focused within the resource it's already presence:join'd to (not
        // itself a join - purely cosmetic, so no permission re-check needed
        // beyond already being in the room). `field: null` clears it on
        // blur. Capped length guards against a client sending garbage.
        socket.on("presence:field", async ({ resourceType, resourceId, field } = {}) => {
            if (!isValidResourceRef({ resourceType, resourceId })) return;
            const room = resourceRoom({ resourceType, resourceId });
            if (!socket.data.rooms.has(room)) return;
            socket.data.focusedField =
                typeof field === "string" && field ? field.slice(0, 80) : null;
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

    // A device's session ending elsewhere publishes here (see
    // sessionStore.js) - drop that exact device's live connection instead of
    // waiting for its next REST call to discover the session is gone. Other
    // devices logged in on the same account (a different sid) are untouched
    // - see the multi-device session model in sessionStore.js.
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
                if (socket.data.user?.id === payload.userId && socket.data.user?.sid === payload.sid) {
                    // A self-initiated logout should just drop the
                    // connection quietly - "revoked" (the user closed this
                    // device from their own sessions list) and "removed" (an
                    // admin removed this team member entirely) are the only
                    // ones that deserve the "you were signed out" toast.
                    if (payload.reason === "revoked" || payload.reason === "removed") {
                        socket.emit("session:replaced");
                    }
                    socket.disconnect(true);
                }
            }
        });
    }

    // A PointOfSale was created, or a member's scope changed elsewhere
    // (see utils/posScopeStore.js) - force a reconnect for whichever
    // sockets that affects, so they pick up correct room membership
    // instead of quietly missing/over-receiving live events until they
    // next happen to reconnect on their own.
    if (isRedisConfigured()) {
        const posScopeSub = getRedisClient().duplicate();
        posScopeSub.subscribe(POS_SCOPE_INVALIDATE_CHANNEL).catch((err) =>
            console.error("[live] Failed to subscribe to pos-scope-invalidate channel:", err?.message)
        );
        posScopeSub.on("message", (channel, message) => {
            if (channel !== POS_SCOPE_INVALIDATE_CHANNEL) return;
            let payload;
            try {
                payload = JSON.parse(message);
            } catch {
                return;
            }
            for (const socket of io.sockets.sockets.values()) {
                const socketUser = socket.data.user;
                if (!socketUser || socketUser.accountId !== payload.accountId) continue;
                // null userId = every socket on this account (new
                // PointOfSale); otherwise only the affected member's own
                // sockets.
                if (payload.userId && socketUser.id !== payload.userId) continue;
                // Unlike a session takeover, this disconnect should be
                // invisible and self-healing - the frontend reconnects with
                // the same still-valid token on seeing this event (see
                // TeamContext.jsx), rather than logging the user out.
                // socket.disconnect(true) alone won't do that:
                // socket.io-client deliberately does NOT auto-reconnect
                // after a server-initiated disconnect ("io server
                // disconnect" is one of the two reasons its Manager treats
                // as final) - the client has to reconnect explicitly.
                // Calling disconnect() in the same tick as emit() races the
                // outbound packet against the connection teardown - verified
                // empirically (a 2026-08-21 test caught the event arriving
                // 0% of the time with no delay) - so this yields one tick
                // first to let the emit actually flush before closing.
                socket.emit("pos-scope:changed");
                setTimeout(() => socket.disconnect(true), 50);
            }
        });
    }

    ioInstance = io;
    return io;
};
