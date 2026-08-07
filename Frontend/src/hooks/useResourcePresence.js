import { useCallback, useEffect, useRef, useState } from "react";
import { useTeam } from "../context/TeamContext";

const HEARTBEAT_MS = 30 * 1000;

// Presence + soft-lock for a single record (see live/socketServer.js on the
// backend). Pass resourceType/resourceId only once you actually have a
// record open (e.g. editing an existing product) - there's nothing to lock
// while creating a brand new one.
export const useResourcePresence = ({ resourceType, resourceId, canEdit = true, active = true }) => {
    const { getSocket, team } = useTeam();
    const [viewers, setViewers] = useState([]);
    const [lock, setLock] = useState(null); // { userId, username, avatar } | null
    const [isMine, setIsMine] = useState(false);
    const heartbeatRef = useRef(null);
    // Mirrors isMine for the unmount cleanup below - a plain closure over
    // isMine would only ever see the value from the render that first
    // mounted the effect (acquireLock flips it well after that).
    const isMineRef = useRef(false);

    const shouldTrack = active && Boolean(team) && Boolean(resourceType) && Boolean(resourceId);

    useEffect(() => {
        if (!shouldTrack) return undefined;
        const socket = getSocket();
        if (!socket) return undefined;

        const ref = { resourceType, resourceId };

        const handlePresenceUpdate = (payload) => {
            setViewers(payload.viewers || []);
        };
        const handleLockUpdate = (payload) => {
            if (payload.resourceType !== resourceType || payload.resourceId !== resourceId) return;
            setLock(payload.locked ? payload.holder : null);
        };

        socket.on("presence:update", handlePresenceUpdate);
        socket.on("lock:update", handleLockUpdate);

        socket.emit("presence:join", ref, (ack) => {
            if (ack?.ok) {
                setViewers(ack.viewers || []);
                setLock(ack.lock || null);
            }
        });

        return () => {
            socket.emit("presence:leave", ref);
            socket.off("presence:update", handlePresenceUpdate);
            socket.off("lock:update", handleLockUpdate);
            setViewers([]);
            setLock(null);
        };
    }, [shouldTrack, resourceType, resourceId, getSocket]);

    const acquireLock = useCallback(() => {
        if (!shouldTrack || !canEdit) return Promise.resolve({ acquired: false });
        const socket = getSocket();
        if (!socket) return Promise.resolve({ acquired: false });

        return new Promise((resolve) => {
            socket.emit("lock:acquire", { resourceType, resourceId }, (result) => {
                const acquired = Boolean(result?.acquired);
                setIsMine(acquired);
                isMineRef.current = acquired;
                if (result?.acquired) {
                    heartbeatRef.current = setInterval(() => {
                        socket.emit("lock:heartbeat", { resourceType, resourceId });
                    }, HEARTBEAT_MS);
                }
                resolve(result);
            });
        });
    }, [shouldTrack, canEdit, resourceType, resourceId, getSocket]);

    const releaseLock = useCallback(() => {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        setIsMine(false);
        isMineRef.current = false;
        if (!shouldTrack) return;
        const socket = getSocket();
        socket?.emit("lock:release", { resourceType, resourceId });
    }, [shouldTrack, resourceType, resourceId, getSocket]);

    // Release on unmount if this tab still holds the lock (e.g. modal closed
    // without an explicit save/cancel path calling releaseLock). Reads
    // isMineRef, not isMine, so it always sees the latest value regardless
    // of when during this mount the lock was actually acquired.
    useEffect(() => () => {
        clearInterval(heartbeatRef.current);
        if (isMineRef.current) {
            const socket = getSocket();
            socket?.emit("lock:release", { resourceType, resourceId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourceType, resourceId]);

    return { viewers, lock, isMine, acquireLock, releaseLock };
};
