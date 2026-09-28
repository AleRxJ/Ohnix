import { useEffect, useState } from "react";
import { teamService } from "../services/teamService";
import { VISIBLE_MODULE_KEYS, PERMISSION_LEVELS, MODULE_DEPENDENCIES } from "../constants/teamModules";

// Role-editor module list from the backend (GET /teams/permission-catalog,
// built from Backend's MODULE_KEYS) so a module added there shows up here
// without a hand-synced frontend copy. The static constants are only the
// first-render/offline fallback. One fetch per page load, shared by every
// component that asks.
const FALLBACK = { moduleKeys: VISIBLE_MODULE_KEYS, levels: PERMISSION_LEVELS, dependencies: MODULE_DEPENDENCIES };
let cached = null;
let inflight = null;

const loadCatalog = () => {
    if (!inflight) {
        inflight = teamService
            .getPermissionCatalog()
            .then((res) => {
                const data = res?.data;
                if (Array.isArray(data?.modules) && data.modules.length > 0) {
                    cached = {
                        moduleKeys: data.modules,
                        levels: Array.isArray(data.levels) && data.levels.length > 0 ? data.levels : PERMISSION_LEVELS,
                        dependencies: data.dependencies && typeof data.dependencies === "object" ? data.dependencies : MODULE_DEPENDENCIES,
                    };
                }
                return cached;
            })
            .catch(() => {
                // Offline/failed - keep the fallback, retry on next mount.
                inflight = null;
                return null;
            });
    }
    return inflight;
};

const usePermissionCatalog = () => {
    const [catalog, setCatalog] = useState(cached || FALLBACK);

    useEffect(() => {
        if (cached) return undefined;
        let active = true;
        loadCatalog().then((result) => {
            if (active && result) setCatalog(result);
        });
        return () => {
            active = false;
        };
    }, []);

    return catalog;
};

export default usePermissionCatalog;
