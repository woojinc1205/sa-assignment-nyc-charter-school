/**
 * MapLibre v6 loads its web worker from a file next to maplibre-gl.mjs. Bundlers
 * move that file, so copy the worker into public/ and point MapLibre at it
 * (see components/MapView.tsx). Runs before `next dev` and `next build`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const dest = join(root, "public", "maplibre", "maplibre-gl-worker.mjs");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("Copied MapLibre worker -> public/maplibre/");
