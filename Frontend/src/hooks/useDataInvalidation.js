import { useEffect, useRef } from "react";
import { useTeam } from "../context/TeamContext";

const DEBOUNCE_MS = 300;

// Subscribes to the account-wide "data:changed" broadcast (see
// Backend/live/dataEvents.js) and re-runs `onChange` - normally the same
// fetch function a hook already calls on mount - whenever another connected
// user (or this same user, another tab) mutates `resource`. This is
// deliberately NOT a payload push: the event only carries which resource
// changed, never the record itself, so there's nothing to merge and no risk
// of this event's shape drifting from the REST response's.
//
// `resource` accepts one string or an array (e.g. a purchases screen also
// wants to know when "product" stock changes elsewhere). Debounced so a
// transaction that touches several resources (a completed order changes
// both "order" and "product") doesn't trigger a refetch per event.
export const useDataInvalidation = (resource, onChange) => {
    const resources = Array.isArray(resource) ? resource : [resource];
    const resourcesKey = resources.join(",");
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const { getSocket, socketConnected } = useTeam();

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return undefined;

        let timer = null;
        const handler = (payload) => {
            if (!resources.includes(payload?.resource)) return;
            clearTimeout(timer);
            timer = setTimeout(() => onChangeRef.current(), DEBOUNCE_MS);
        };

        socket.on("data:changed", handler);
        return () => {
            clearTimeout(timer);
            socket.off("data:changed", handler);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourcesKey, socketConnected, getSocket]);
};
