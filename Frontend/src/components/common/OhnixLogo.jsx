import React from "react";

// The Ohnix logo as vector: a 2x2x2 isometric stack of boxes inside an
// orbit, crossed by the diagonal node line - redrawn instead of using the
// raster logos, which are 400KB+ Canva exports and (the "lite" one) thin
// light-gray strokes that wash out on light backgrounds. Strokes use
// --ohnix-text-primary and fills are translucent cyan, so it reads in both
// themes.
//
// animated: the "assembly" loop (index.css .ohnix-logo--animated) - orbit
// draws in, boxes drop and stack one by one, the axis fires through, the
// core flashes with a shockwave, then the stack lifts away and repeats.
// No antd here: OhnixLoader renders this from the always-loaded entry chunk.

const CENTER = 60;
const HALF_W = 15; // half width of one box's top face
const HALF_H = 8.66; // half height of that face (true isometric ratio)
const EDGE = 17.32; // vertical edge length
const TOP = 51.46; // y of the (0,0,0) box's top-face center, centers the stack

// Painter's order: bottom layer first, back to front - also the order the
// boxes drop in, so the stack builds up naturally.
const BOXES = [];
for (const z of [0, 1]) {
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const cx = CENTER + (x - y) * HALF_W;
        const cy = TOP + (x + y) * HALF_H - z * EDGE;
        BOXES.push({
            key: `${x}${y}${z}`,
            top: `M${cx} ${cy - HALF_H} L${cx + HALF_W} ${cy} L${cx} ${cy + HALF_H} L${cx - HALF_W} ${cy} Z`,
            left: `M${cx - HALF_W} ${cy} L${cx} ${cy + HALF_H} L${cx} ${cy + HALF_H + EDGE} L${cx - HALF_W} ${cy + EDGE} Z`,
            right: `M${cx + HALF_W} ${cy} L${cx} ${cy + HALF_H} L${cx} ${cy + HALF_H + EDGE} L${cx + HALF_W} ${cy + EDGE} Z`,
            // A small "label" line on the front-right face, like the boxes in the brand art.
            label: `M${cx + HALF_W * 0.3} ${cy + HALF_H * 0.7 + EDGE * 0.45} L${cx + HALF_W * 0.7} ${cy + HALF_H * 0.3 + EDGE * 0.45}`,
        });
    }
}

const OhnixLogo = ({ size = 120, animated = false, className = "" }) => (
    <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className={`ohnix-logo ${animated ? "ohnix-logo--animated" : ""} ${className}`}
        aria-hidden="true"
        focusable="false"
    >
        <circle cx="60" cy="60" r="52" className="ohnix-logo__orbit" pathLength="100" />
        <circle cx="60" cy="60" r="44" className="ohnix-logo__ring" />
        <g className="ohnix-logo__satellite">
            <circle cx="60" cy="8" r="3.2" className="ohnix-logo__node" />
        </g>

        <g className="ohnix-logo__stack" strokeLinejoin="round">
            {BOXES.map((box, index) => (
                <g key={box.key} className="ohnix-logo__box" style={{ "--i": index }}>
                    <path d={box.left} className="ohnix-logo__face ohnix-logo__face--left" />
                    <path d={box.right} className="ohnix-logo__face ohnix-logo__face--right" />
                    <path d={box.top} className="ohnix-logo__face ohnix-logo__face--top" />
                    <path d={box.label} className="ohnix-logo__label" />
                </g>
            ))}
        </g>

        <line x1="22" y1="98" x2="98" y2="22" className="ohnix-logo__axis" pathLength="100" />
        <circle cx="22" cy="98" r="2.6" className="ohnix-logo__axis-node ohnix-logo__axis-node--start" />
        <circle cx="98" cy="22" r="2.6" className="ohnix-logo__axis-node ohnix-logo__axis-node--end" />
        <circle cx="60" cy="60" r="5" className="ohnix-logo__shockwave" />
        <circle cx="60" cy="60" r="4.2" className="ohnix-logo__core" />
    </svg>
);

export default OhnixLogo;
