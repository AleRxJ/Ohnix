import React from "react";
import { Composition } from "remotion";
import { OhnixDemo, TOTAL_FRAMES } from "./OhnixDemo.jsx";
import { FPS } from "./theme.js";

export const Root = () => (
    <Composition id="OhnixDemo" component={OhnixDemo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
