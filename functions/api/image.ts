import { Env } from "../../src/env";
import { proxyOrLocal } from "../../src/bild/proxy";
import { handleImage } from "../../src/bild/image-handler";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  return proxyOrLocal(ctx, handleImage);
};
