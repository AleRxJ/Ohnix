import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { Easing, interpolate, spring } from "remotion";

// Same typeface and palette as the app/landing (Frontend/index.html + navigation.css).
export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "700"] });

export const C = {
    bg: "#050505",
    panel: "#0b0d0e",
    panel2: "#0f1213",
    line: "rgba(255,255,255,0.08)",
    line2: "rgba(255,255,255,0.14)",
    accent: "#29D8D5",
    accent2: "#44F3F0",
    accentSoft: "rgba(41,216,213,0.12)",
    accentLine: "rgba(41,216,213,0.4)",
    text: "#ffffff",
    soft: "#D6DEE1",
    muted: "#A9B3B8",
    dim: "#66727A",
    alert: "#fb7185",
    warn: "#f5a524",
    ok: "#34d399",
};

export const GRAD = "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)";

export const FPS = 30;

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// 0→1 ramp between two frames, eased.
export const ramp = (frame, from, to, easing = Easing.bezier(0.16, 1, 0.3, 1)) =>
    interpolate(frame, [from, to], [0, 1], { ...clamp, easing });

export const pop = (frame, fps, delay = 0, config = { damping: 14, stiffness: 140, mass: 0.8 }) =>
    spring({ frame: frame - delay, fps, config });

export const soft = (frame, fps, delay = 0) =>
    spring({ frame: frame - delay, fps, config: { damping: 200 } });

// Colombian peso formatting, as the app shows it: "$ 1.071.000".
export const cop = (n) => "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// Deterministic pseudo-random so every render is identical.
export const rand = (seed) => {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
};
