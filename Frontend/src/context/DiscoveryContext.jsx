import { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTeam } from "./TeamContext";
import useSubscription from "../hooks/useSubscription";
import { discoveryService } from "../services/discoveryService";

const DiscoveryContext = createContext(null);

const OPEN_STATUSES = ["detected", "investigating", "validated", "published", "learned"];

// One fetch of published Discoveries, shared by every place that needs to
// know "does Ohnix currently have something to show" - the floating widget,
// the full-screen reveal moment, the sidebar's live count badge and the
// dashboard hero card all used to each fetch this independently. Elevating
// Discoveries from "one more module" to the app's own headline feature
// means those surfaces now agree with each other instantly (dismissing one
// from the widget updates the sidebar badge in the same tick) instead of
// drifting until their next independent poll.
export const DiscoveryProvider = ({ children }) => {
    const { hasPermission, loading: teamLoading } = useTeam();
    // Discovery Engine is a Negocio+ feature (PLAN_FEATURES.discoveryEngine) -
    // a Starter account would just 403 on every request here, so this stays
    // silent for them the same way the widget/reveal overlay already stay
    // silent for someone without "reports" view permission.
    const { can, loading: subscriptionLoading } = useSubscription();
    const [discoveries, setDiscoveries] = useState([]);
    const [loading, setLoading] = useState(true);

    const anyLoading = teamLoading || subscriptionLoading;
    const canView = !anyLoading && hasPermission("discoveries", "view") && can("discoveryEngine");

    const refresh = useCallback(() => {
        if (!canView) {
            setDiscoveries([]);
            setLoading(false);
            return Promise.resolve();
        }
        setLoading(true);
        return discoveryService
            .list({ status: "published" })
            .then(setDiscoveries)
            .catch(() => setDiscoveries([]))
            .finally(() => setLoading(false));
    }, [canView]);

    useEffect(() => {
        if (anyLoading) return;
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView, anyLoading]);

    const top = [...discoveries].sort((a, b) => b.priority_score - a.priority_score);
    const openCount = discoveries.filter((d) => OPEN_STATUSES.includes(d.status)).length;

    // updateStatus (mark actioned/resolved/dismissed) and the reveal
    // overlay's own localStorage tracking both remove a Discovery from
    // "published" server-side or hide it client-side - either way, every
    // consumer should stop counting it without waiting on the next poll.
    const removeLocally = useCallback((id) => {
        setDiscoveries((prev) => prev.filter((d) => d._id !== id));
    }, []);

    const value = { discoveries, top, openCount, loading, canView, refresh, removeLocally };

    return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
};

DiscoveryProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

export const useDiscoveries = () => {
    const context = useContext(DiscoveryContext);
    if (!context) {
        throw new Error("useDiscoveries must be used within a DiscoveryProvider");
    }
    return context;
};

export default DiscoveryContext;
