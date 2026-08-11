import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// package.json has "type": "module", so __dirname isn't available here - resolve it
// explicitly rather than relying on Vite's config-loader shim for it.
const rootDir = dirname(fileURLToPath(import.meta.url));
// Stamps a unique id into sw.js and writes it straight to dist/, so its bytes differ on
// every build. Browsers detect service worker updates by byte-diffing the script - without
// this, an unchanged sw.js (even with a fully changed app bundle underneath it) would never
// trigger the update/install cycle, and clients could stay on old code indefinitely.
//
// The template lives at sw-template.js (repo root), NOT in public/ - Vite copies public/
// verbatim to dist/ *after* the build's closeBundle hooks run, which would silently clobber
// a stamped file placed there under the same name.
function stampServiceWorkerBuildId() {
  let outDir = "dist";
  let projectRoot = rootDir;
  return {
    name: "stamp-sw-build-id",
    configResolved(config) {
      outDir = config.build.outDir;
      projectRoot = config.root;
    },
    closeBundle() {
      const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const template = readFileSync(
        resolve(rootDir, "sw-template.js"),
        "utf-8",
      );
      writeFileSync(
        resolve(projectRoot, outDir, "sw.js"),
        template.replaceAll("__BUILD_ID__", buildId),
      );
    },
  };
}
// IMPORTANT: set `base` to your GitHub repo name (with leading and trailing slashes)
// e.g. if your repo is github.com/yourname/wendler-tracker, base should be '/wendler-tracker/'.
// If you're deploying to a custom domain or a user/org page (yourname.github.io), set base to '/'.
const base = process.env.NODE_ENV === "production" ? "/wendler-tracker/" : "/";
export default defineConfig({
  plugins: [react(), stampServiceWorkerBuildId()],
  base,
  build: {
    outDir: "dist",
  },
});
