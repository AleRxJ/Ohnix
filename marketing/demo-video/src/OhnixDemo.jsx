import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Intro, LogoReveal } from "./scenes/Intro.jsx";
import { Dashboard } from "./scenes/Dashboard.jsx";
import { Pos } from "./scenes/Pos.jsx";
import { Dian } from "./scenes/Dian.jsx";
import { Flow } from "./scenes/Flow.jsx";
import { Offline } from "./scenes/Offline.jsx";
import { Assistant } from "./scenes/Assistant.jsx";
import { EndCard, Modules } from "./scenes/Outro.jsx";
import { C, fontFamily } from "./theme.js";

const T = 18; // transition length in frames

// Story: too many tools → Ohnix → dashboard → sell at the POS → DIAN e-invoice →
// that one sale updates inventory/accounting/cash → keeps working offline →
// assistant → everything else → CTA.
const SCENES = [
    { C: Intro, d: 150, t: null },
    { C: LogoReveal, d: 110, t: fade() },
    { C: Dashboard, d: 190, t: fade() },
    { C: Pos, d: 170, t: slide({ direction: "from-right" }) },
    { C: Dian, d: 150, t: fade() },
    { C: Flow, d: 170, t: wipe({ direction: "from-bottom" }) },
    { C: Offline, d: 180, t: slide({ direction: "from-bottom" }) },
    { C: Assistant, d: 190, t: slide({ direction: "from-right" }) },
    { C: Modules, d: 130, t: fade() },
    { C: EndCard, d: 150, t: fade() },
];

export const TOTAL_FRAMES = SCENES.reduce((s, x) => s + x.d, 0) - SCENES.filter((x) => x.t).length * T;

export const OhnixDemo = () => (
    <AbsoluteFill style={{ background: C.bg, fontFamily }}>
        <TransitionSeries>
            {SCENES.flatMap(({ C: Scene, d, t }, i) => [
                t ? (
                    <TransitionSeries.Transition
                        key={`t${i}`}
                        presentation={t}
                        timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
                    />
                ) : null,
                <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d}>
                    <Scene />
                </TransitionSeries.Sequence>,
            ]).filter(Boolean)}
        </TransitionSeries>
    </AbsoluteFill>
);
