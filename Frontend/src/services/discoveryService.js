import { api } from "../api/api";

export const discoveryService = {
    list: async ({ status, type } = {}) => {
        const response = await api.get("/discoveries", { params: { status, type } });
        return response.data.data;
    },
    get: async (id) => {
        const response = await api.get(`/discoveries/${id}`);
        return response.data.data;
    },
    updateStatus: async (id, status, reason) => {
        const response = await api.patch(`/discoveries/${id}/status`, { status, reason });
        return response.data.data;
    },
    setExplanation: async (id, explanation, tag) => {
        const response = await api.patch(`/discoveries/${id}/explanation`, { explanation, tag });
        return response.data.data;
    },
    // Admin-only - see Backend/controllers/discoveryDimensionConfig.controller.js.
    // Lets an operator turn a registered-but-dormant search dimension on (or
    // a default-on one off) for a config-driven detector without a deploy.
    listDimensionConfig: async (detectorKey) => {
        const response = await api.get("/discovery-dimension-config", { params: { detectorKey } });
        return response.data.data;
    },
    setDimensionConfig: async ({ detectorKey, dimensionKey, enabled }) => {
        const response = await api.patch("/discovery-dimension-config", { detectorKey, dimensionKey, enabled });
        return response.data.data;
    },
    // Admin-only - see Backend/controllers/discoveryPatternStats.controller.js.
    // The Fase 4 learning loop's own track record per detector: how often a
    // registered prediction actually held up, and the confidence that gets
    // blended into that detector's future findings as a result.
    getPatternStats: async () => {
        const response = await api.get("/discovery-pattern-stats");
        return response.data.data;
    },
    // Admin-only - manually triggers the same nightly pipeline
    // (utils/discoveryScheduler.js#runDiscoveryEngineOnce) the 04:30 cron
    // runs, for testing/demoing without waiting for it - see
    // Backend/routes/scheduler.routes.js's /discovery-engine-run. Every
    // detector x every active account, genuinely took ~200s against the 13
    // real/demo accounts that exist today (measured directly, not a guess) -
    // api.js's global 30s timeout exists for stalled requests, not for a
    // real batch job that's still working, so this overrides it per-request
    // exactly the way that file's own comment says to.
    runSchedulerNow: async () => {
        const response = await api.post("/scheduler/discovery-engine-run", null, { timeout: 300000 });
        return response.data.data;
    },
};
