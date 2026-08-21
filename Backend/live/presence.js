// Presence is intentionally NOT stored in Redis - Socket.IO's own room
// membership (synced across instances by the Redis adapter, see
// socketServer.js) is already the live, authoritative list of who's
// connected. Re-deriving it from `io.in(room).fetchSockets()` avoids a
// second source of truth that could drift if a disconnect event is ever
// missed.
export const presenceRoom = (accountId, resourceType, resourceId) =>
    `presence:${accountId}:${resourceType}:${resourceId}`;

export const getPresenceList = async (io, room) => {
    const sockets = await io.in(room).fetchSockets();
    const byUser = new Map();
    for (const s of sockets) {
        const user = s.data.user;
        if (user && !byUser.has(user.id)) {
            byUser.set(user.id, {
                userId: user.id,
                username: user.username,
                avatar: user.avatar,
                // Which form field this viewer currently has focused, if
                // any - see socketServer.js's "presence:field" handler. Lets
                // the UI show not just "who's here" but "who's touching
                // what", so a save conflict is visible before it happens
                // instead of only after (see optimisticConcurrency.js on
                // the backend for the after-the-fact guard).
                field: s.data.focusedField || null,
            });
        }
    }
    return [...byUser.values()];
};

export const broadcastPresence = async (io, room) => {
    const list = await getPresenceList(io, room);
    io.to(room).emit("presence:update", { room, viewers: list });
    return list;
};
