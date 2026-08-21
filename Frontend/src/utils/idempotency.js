// A fresh key per call is what makes this useless for its purpose - reusing
// one across unrelated submissions would make the second submission replay
// the first's response instead of running. Only reuse a key across attempts
// of the *same* logical submission (e.g. an axios retry), never across two
// separate user actions.
export const idempotencyHeaders = () => ({
    headers: { "Idempotency-Key": crypto.randomUUID() },
});
