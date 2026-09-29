// Landing/demo video + poster (rendered by marketing/demo-video, `npm run render`).
// vercel.json caches images for a week under the same URL, so bump this whenever
// the files are re-rendered - otherwise returning visitors keep the old poster.
const DEMO_MEDIA_VERSION = "2026-09-28";

export const DEMO_VIDEO_SRC = `/demo-preview.mp4?v=${DEMO_MEDIA_VERSION}`;
export const DEMO_POSTER_SRC = `/demo-poster.jpg?v=${DEMO_MEDIA_VERSION}`;
