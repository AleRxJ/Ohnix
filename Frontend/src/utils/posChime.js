// Short two-note chime for the restaurant screens (new comanda in the
// kitchen, a QR order or "ready" for the waiter). Synthesized with WebAudio
// so there's no asset to load or cache offline. Browsers only allow audio
// after a user gesture on the page - before that this is silently a no-op.
let ctx = null;

export const playChime = ({ urgent = false } = {}) => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        ctx = ctx || new AudioCtx();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const notes = urgent ? [880, 1175, 880] : [784, 1047];
        notes.forEach((freq, index) => {
            const start = ctx.currentTime + index * 0.16;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.32);
        });
    } catch {
        // Sound is a nicety; the visual cue is always there.
    }
};

// Phones: a short buzz alongside the toast (ignored where unsupported).
export const buzz = (pattern = [120, 60, 120]) => {
    try {
        navigator.vibrate?.(pattern);
    } catch {
        // Not supported.
    }
};
