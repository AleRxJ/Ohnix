import React from "react";
import { Composition } from "remotion";
import { OhnixDemo, TOTAL_FRAMES } from "./OhnixDemo.jsx";
import { FPS } from "./theme.js";

export const Root = () => (
    <>
        {/* 16:9 — landing page (Frontend/public/demo-preview.mp4) */}
        <Composition id="OhnixDemo" component={OhnixDemo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
        {/* 9:16 — Instagram Reels / TikTok; scenes switch layout via useIsVertical() */}
        <Composition id="OhnixDemoVertical" component={OhnixDemo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
    </>
);
