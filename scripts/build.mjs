// Unified app: dist/hub = apps/chat + apps/waechter + apps/hub (hub last wins) + apps/shared -> ./shared/.
// Legacy dist/chat + dist/waechter are redirect stubs to the hub.
// Bild service: dist/bild = apps/bild + apps/shared -> ./shared/.
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
const HUB = "https://jeffa-hub.pages.dev";
rmSync("dist", { recursive: true, force: true });
const out = "dist/hub";
mkdirSync(out, { recursive: true });
for (const a of ["chat", "waechter", "hub"]) cpSync(`apps/${a}`, out, { recursive: true });
rmSync(`${out}/hub.js`, { force: true }); rmSync(`${out}/hub.css`, { force: true }); rmSync(`${out}/app.js.chat`, { force: true });
cpSync("apps/shared", `${out}/shared`, { recursive: true });
if (existsSync("assets/icon.svg")) cpSync("assets/icon.svg", `${out}/icon.svg`);
console.log("built", out);
for (const [a, hash] of [["chat", "chat"], ["waechter", "waechter"]]) {
  const d = `dist/${a}`; mkdirSync(d, { recursive: true });
  writeFileSync(`${d}/404.html`, `<!doctype html><meta http-equiv="refresh" content="0;url=${HUB}/#${hash}">`);
  writeFileSync(`${d}/index.html`, `<!doctype html><meta http-equiv="refresh" content="0;url=${HUB}/#${hash}"><a href="${HUB}/#${hash}">Jeffa öffnen</a>`);
  writeFileSync(`${d}/sw.js`, `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.map(c=>caches.delete(c)))).then(()=>self.registration.unregister())));`);
  console.log("built redirect", d);
}
const bildOut = "dist/bild";
mkdirSync(bildOut, { recursive: true });
if (existsSync("apps/bild")) cpSync("apps/bild", bildOut, { recursive: true });
cpSync("apps/shared", `${bildOut}/shared`, { recursive: true });
if (!existsSync(`${bildOut}/icon.svg`) && existsSync("assets/icon.svg")) {
  cpSync("assets/icon.svg", `${bildOut}/icon.svg`);
}
console.log("built", bildOut);
