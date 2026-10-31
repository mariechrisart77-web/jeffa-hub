import { Env } from "../../../../src/env";
import { BUILD } from "../../../../src/build-info";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const hasVenice = !!ctx.env.VENICE_API_KEY;
  return new Response(
    JSON.stringify({ ok: true, service: "jeffa-bild", venice: hasVenice, commit: BUILD.commit, version: BUILD.version }),
    { headers: { "content-type": "application/json; charset=utf-8" } }
  );
};
