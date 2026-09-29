// Synthesizes the video's sound effects as WAV files into public/sfx/ -
// generated in code (no downloaded samples), so there are no licensing
// questions when the video is published. Run: `npm run sfx`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");

// Deterministic noise so every regeneration is byte-identical.
let seed = 1337;
const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
};

const make = (seconds, fn) => {
    const n = Math.round(seconds * SR);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
    return out;
};

// State-variable filter, cutoff may change per sample.
const svf = () => {
    let low = 0;
    let band = 0;
    return (x, cutoff, q = 0.7) => {
        const f = 2 * Math.sin((Math.PI * Math.min(cutoff, SR / 6)) / SR);
        low += f * band;
        const high = x - low - q * band;
        band += f * high;
        return { low, band, high };
    };
};

const mix = (...tracks) => {
    const n = Math.max(...tracks.map((t) => t.length));
    const out = new Float32Array(n);
    for (const t of tracks) for (let i = 0; i < t.length; i++) out[i] += t[i];
    return out;
};

const delay = (track, seconds) => {
    const pad = Math.round(seconds * SR);
    const out = new Float32Array(track.length + pad);
    out.set(track, pad);
    return out;
};

// Cheap room: a few decaying feedback taps, enough to stop dry synth sounds
// from feeling like a 1990s PC speaker.
const room = (track, amount = 0.25, tail = 0.35) => {
    const out = new Float32Array(track.length + Math.round(tail * SR));
    out.set(track);
    for (const [ms, gain] of [[23, 0.5], [37, 0.4], [53, 0.3], [79, 0.22], [113, 0.15]]) {
        const d = Math.round((ms / 1000) * SR);
        for (let i = d; i < out.length; i++) out[i] += out[i - d] * gain * amount;
    }
    return out;
};

const normalize = (track, peakDb = -3) => {
    const peak = track.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    const target = 10 ** (peakDb / 20);
    // Short fade out avoids clicks at the end of every file.
    const fade = Math.min(track.length, Math.round(0.01 * SR));
    return track.map((v, i) => (v / peak) * target * (i > track.length - fade ? (track.length - i) / fade : 1));
};

const writeWav = (name, track) => {
    const data = normalize(track);
    const buf = Buffer.alloc(44 + data.length * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + data.length * 2, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(SR, 24);
    buf.writeUInt32LE(SR * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(data.length * 2, 40);
    data.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
    writeFileSync(join(OUT, `${name}.wav`), buf);
    console.log(`sfx/${name}.wav  ${(data.length / SR).toFixed(2)}s`);
};

const tone = (freq, seconds, decay, { attack = 0.002, glideTo = null } = {}) => {
    let phase = 0;
    return make(seconds, (t) => {
        const f = glideTo ? freq * (glideTo / freq) ** (t / seconds) : freq;
        phase += (2 * Math.PI * f) / SR;
        const env = Math.min(1, t / attack) * Math.exp(-t / decay);
        return Math.sin(phase) * env;
    });
};

mkdirSync(OUT, { recursive: true });

// Transition swoosh: band-passed noise sweeping up then down.
{
    const f = svf();
    const len = 0.6;
    writeWav(
        "whoosh",
        room(
            make(len, (t) => {
                const p = t / len;
                const env = Math.sin(Math.PI * p) ** 2;
                return f(noise(), 400 + 5200 * Math.sin(Math.PI * p ** 0.8), 0.35).band * env;
            }),
            0.15
        )
    );
}

// Build-up before the logo: rising filtered noise + rising sine.
{
    const f = svf();
    const len = 1.3;
    const sine = tone(110, len, 99, { glideTo: 880, attack: 0.2 });
    writeWav(
        "riser",
        make(len, (t, i) => {
            const p = t / len;
            return (f(noise(), 300 + 7000 * p * p, 0.5).band * 0.8 + sine[i] * 0.35) * p ** 2.2;
        })
    );
}

// Cinematic hit: pitch-dropping sub + noise crack + long room.
{
    const sub = tone(90, 1.6, 0.45, { glideTo: 38, attack: 0.001 });
    const f = svf();
    const crack = make(0.25, (t) => f(noise(), 2500, 0.8).low * Math.exp(-t / 0.04));
    writeWav("impact", room(mix(sub, crack.map((v) => v * 0.7)), 0.35, 0.8));
}

// UI click (mouse press).
{
    const f = svf();
    writeWav("click", mix(tone(1800, 0.06, 0.008), make(0.03, (t) => f(noise(), 6000, 0.9).high * Math.exp(-t / 0.004) * 0.6)));
}

// Soft bubble pop for UI elements appearing.
writeWav("pop", room(tone(520, 0.18, 0.05, { glideTo: 1250, attack: 0.003 }), 0.12, 0.15));

// Keyboard tick for typing.
{
    const f = svf();
    writeWav("tick", make(0.035, (t) => (f(noise(), 4200, 0.6).band + Math.sin(2 * Math.PI * 2600 * t) * 0.3) * Math.exp(-t / 0.006)));
}

// Sale confirmed: two bright bell notes (E6 -> B6).
{
    const bell = (freq) => mix(tone(freq, 1.2, 0.35), tone(freq * 2.01, 1.2, 0.18).map((v) => v * 0.35), tone(freq * 3.02, 0.8, 0.08).map((v) => v * 0.15));
    writeWav("ding", room(mix(bell(1318.5), delay(bell(1975.5), 0.09)), 0.3, 0.6));
}

// Rubber-stamp slam: low thud + paper slap.
{
    const f = svf();
    const thud = tone(120, 0.5, 0.09, { glideTo: 55 });
    const slap = make(0.12, (t) => f(noise(), 1800, 0.7).low * Math.exp(-t / 0.02));
    writeWav("stamp", room(mix(thud, slap), 0.3, 0.3));
}

// Wire pulse arriving: short high blip.
writeWav("blip", room(tone(1760, 0.15, 0.03), 0.15, 0.15));

// Connection lost: descending tone with a bit-crushed wobble.
{
    const base = tone(900, 0.8, 0.3, { glideTo: 70, attack: 0.005 });
    writeWav("powerdown", base.map((v, i) => Math.round(v * 6) / 6 * (1 + 0.3 * Math.sin(i / 90))));
}

// Glitch burst: random square-wave hops.
{
    let freq = 300;
    let phase = 0;
    writeWav(
        "glitch",
        make(0.3, (t, i) => {
            if (i % 700 === 0) freq = 150 + Math.abs(noise()) * 2200;
            phase += freq / SR;
            return (phase % 1 < 0.5 ? 1 : -1) * 0.6 * (Math.abs(noise()) > 0.15 ? 1 : 0) * Math.exp(-t / 0.15);
        })
    );
}

// Back online / success: rising C-major arpeggio.
writeWav("chime", room(mix(tone(1046.5, 0.9, 0.25), delay(tone(1318.5, 0.8, 0.25), 0.07), delay(tone(1568, 0.8, 0.3), 0.14)), 0.3, 0.5));

console.log(`-> ${OUT}`);
