import cron from "node-cron";
import { isItcycleConfigured } from "../services/itcycleDian.service.js";

// itcycle-api-dian's free-tier Render instance sleeps after ~15min of no
// inbound traffic and takes 30-60s to cold-start back up - see the retry
// budget comment in itcycleDian.service.js. That budget already covers most
// cold starts transparently, but a company checking their DIAN settings
// right after a quiet stretch could still see "No pudimos verificar el
// estado" (getMyItcycleStatus's readinessError) while it wakes. Pinging its
// public, unauthenticated /health route often enough that the instance never
// goes idle long enough to sleep removes the cold start instead of just
// tolerating it.
const getItcycleBaseUrl = () => `${process.env.ITCYCLE_API_URL || ""}`.trim().replace(/\/$/, "");
const KEEP_ALIVE_TIMEOUT_MS = 10000;

export const pingItcycleHealth = async () => {
    const baseUrl = getItcycleBaseUrl();
    if (!baseUrl) return { skipped: true };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), KEEP_ALIVE_TIMEOUT_MS);
    try {
        const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
        return { ok: response.ok, status: response.status };
    } finally {
        clearTimeout(timeout);
    }
};

class ItcycleKeepAliveScheduler {
    constructor() {
        this.task = null;
    }

    start() {
        if (this.task || !isItcycleConfigured()) return;
        const cronExpression = process.env.ITCYCLE_KEEP_ALIVE_CRON || "*/10 * * * *";
        this.task = cron.schedule(cronExpression, async () => {
            try {
                const result = await pingItcycleHealth();
                if (!result.skipped && !result.ok) {
                    console.warn(`[itcycle-keep-alive] health check returned HTTP ${result.status}`);
                }
            } catch (error) {
                // A miss here just means this run didn't manage to keep it warm -
                // it's still asleep/waking, same as any other cold start. Not
                // worth escalating past a log line since the retry budget on the
                // actual request path already covers that case.
                console.warn("[itcycle-keep-alive] ping failed", error.message);
            }
        });
    }

    stop() {
        this.task?.stop();
        this.task = null;
    }
}

export default new ItcycleKeepAliveScheduler();
