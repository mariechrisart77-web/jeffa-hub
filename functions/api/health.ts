import { BUILD } from "../../src/build-info";
export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: true, time: new Date().toISOString(), commit: BUILD.commit, version: BUILD.version }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
