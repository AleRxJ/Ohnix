// Thin, swappable interface over whichever LLM actually drafts the
// assistant's reply. Every provider below takes the same (systemPrompt,
// userPrompt) pair and returns plain text - swapping ASSISTANT_MODEL_PROVIDER
// (env var) from "groq" to e.g. "anthropic" later needs no change anywhere
// else in the assistant code, only a new case here.
//
// Groq is the default because its free tier (no card required) comfortably
// covers Ohnix's expected volume - see the cost analysis from the assistant
// architecture review (2026-08-31). Nothing else in this file assumes Groq
// specifically stays free forever; when/if that stops being true, flipping
// the env var is the entire migration.

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const callGroq = async (systemPrompt, userPrompt) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY is not configured");
    }

    const model = process.env.ASSISTANT_GROQ_MODEL || "openai/gpt-oss-120b";
    const controller = new AbortController();
    const timeoutMs = Number(process.env.ASSISTANT_MODEL_TIMEOUT_MS) || 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(GROQ_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.2,
                max_tokens: 700,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            throw new Error(`Groq request failed (${response.status}): ${errorBody.slice(0, 300)}`);
        }

        const payload = await response.json();
        const text = payload?.choices?.[0]?.message?.content;
        if (!text) {
            throw new Error("Groq response had no message content");
        }
        return text.trim();
    } finally {
        clearTimeout(timeout);
    }
};

const PROVIDERS = {
    groq: callGroq,
};

export const generateAssistantReply = async (systemPrompt, userPrompt) => {
    const provider = process.env.ASSISTANT_MODEL_PROVIDER || "groq";
    const handler = PROVIDERS[provider];
    if (!handler) {
        throw new Error(`Unknown ASSISTANT_MODEL_PROVIDER: ${provider}`);
    }
    return handler(systemPrompt, userPrompt);
};
