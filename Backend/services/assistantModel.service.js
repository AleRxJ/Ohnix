// Thin, swappable interface over whichever LLM actually drafts the
// assistant's reply. Every provider below takes the same OpenAI-style
// { messages, responseFormat } and returns { content } - swapping ASSISTANT_MODEL_PROVIDER
// (env var) from "groq" to e.g. "anthropic" later needs no change anywhere
// else in the assistant code, only a new case here.
//
// Groq is the default because its free tier (no card required) comfortably
// covers Ohnix's expected volume - see the cost analysis from the assistant
// architecture review (2026-08-31). Nothing else in this file assumes Groq
// specifically stays free forever; when/if that stops being true, flipping
// the env var is the entire migration.

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_RATE_LIMIT_WAIT_MS = 3000;

// Groq's 429 body says how long until the tokens-per-minute window frees up
// ("Please try again in 255ms" / "in 1.5s"). Short waits are worth one
// silent retry - the person sees a slightly slower reply instead of the
// "assistant unavailable" fallback. Anything longer fails fast.
const parseRetryAfterMs = (errorBody) => {
    const match = /try again in ([\d.]+)(ms|s)/i.exec(errorBody);
    if (!match) return null;
    const value = Number(match[1]);
    return match[2].toLowerCase() === "s" ? value * 1000 : value;
};

// Takes an OpenAI-style conversation plus an optional response_format
// (the agent asks for a strict json_schema - see assistantAgent.service.js
// for why that replaced tool calling) and returns { content } as raw text;
// parsing it is the agent's job, since only it knows the turn's shape.
//
// Groq reports a generation it refused to return - one that broke the
// requested schema - as HTTP 400 with the text in error.failed_generation.
// That's retried once, then handed back as-is: the agent's parseTurn can
// usually still recover an answer from it, which beats the canned
// "assistant unavailable" message.
const parseFailedGeneration = (errorBody) => {
    try {
        const generation = JSON.parse(errorBody)?.error?.failed_generation;
        return typeof generation === "string" ? generation : null;
    } catch {
        return null;
    }
};

const callGroq = async ({ messages, responseFormat }, { retried = false } = {}) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY is not configured");
    }

    const model = process.env.ASSISTANT_GROQ_MODEL || "openai/gpt-oss-120b";
    const controller = new AbortController();
    const timeoutMs = Number(process.env.ASSISTANT_MODEL_TIMEOUT_MS) || 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const retry = async (waitMs = 0) => {
        clearTimeout(timeout);
        if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
        return callGroq({ messages, responseFormat }, { retried: true });
    };

    try {
        const response = await fetch(GROQ_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                ...(responseFormat ? { response_format: responseFormat } : {}),
                // gpt-oss spends completion tokens on hidden reasoning before
                // the visible answer - "low" keeps a guided turn fast and
                // inside the free tier's tokens-per-minute budget, and
                // max_tokens leaves room for that reasoning on top of the
                // reply itself.
                ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
                temperature: 0.2,
                max_tokens: 1500,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            const retryAfterMs = response.status === 429 ? parseRetryAfterMs(errorBody) : null;
            if (!retried && retryAfterMs !== null && retryAfterMs <= MAX_RATE_LIMIT_WAIT_MS) {
                return retry(retryAfterMs + 100);
            }
            const failedGeneration = response.status === 400 ? parseFailedGeneration(errorBody) : null;
            if (failedGeneration !== null) {
                if (!retried) return retry();
                if (failedGeneration.trim()) return { content: failedGeneration.trim() };
            }
            throw new Error(`Groq request failed (${response.status}): ${errorBody.slice(0, 300)}`);
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content?.trim();
        if (!content) {
            throw new Error("Groq response had no content");
        }
        return { content };
    } finally {
        clearTimeout(timeout);
    }
};

const PROVIDERS = {
    groq: callGroq,
};

export const callAssistantModel = async ({ messages, responseFormat }) => {
    const provider = process.env.ASSISTANT_MODEL_PROVIDER || "groq";
    const handler = PROVIDERS[provider];
    if (!handler) {
        throw new Error(`Unknown ASSISTANT_MODEL_PROVIDER: ${provider}`);
    }
    return handler({ messages, responseFormat });
};
