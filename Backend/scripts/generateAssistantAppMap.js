// Regenerates data/assistantAppMap.generated.json - the assistant's
// knowledge extracted from the frontend's own screens (see
// services/assistantAppMapBuilder.js). Run after changing a screen's text:
//   npm run assistant:app-map
// test/assistantAppMap.test.js fails while the committed file is stale, so
// a UI change can't silently leave the assistant describing the old screen.
// The server loads the file into the knowledge base on boot
// (assistantAppMapSync.service.js) - no manual seeding step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAppMapFromDisk, APP_MAP_OUTPUT_PATH } from "../services/assistantAppMapSources.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appMap = buildAppMapFromDisk({ repoRoot: path.resolve(backendRoot, "..") });
fs.writeFileSync(path.join(backendRoot, APP_MAP_OUTPUT_PATH), `${JSON.stringify(appMap, null, 2)}\n`);
const counts = appMap.chunks.reduce((acc, chunk) => ({ ...acc, [chunk.locale]: (acc[chunk.locale] || 0) + 1 }), {});
console.log(`App map ${appMap.hash}: ${appMap.chunks.length} chunks`, counts);
