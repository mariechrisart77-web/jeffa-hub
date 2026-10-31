import { Env } from "../../../src/env";
import { proxyOrLocal } from "../../../src/bild/proxy";
import { handleImageFb } from "../../../src/bild/imagefb-handler";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  return proxyOrLocal(ctx, handleImageFb);
};
