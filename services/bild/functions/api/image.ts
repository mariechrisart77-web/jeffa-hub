import { Env } from "../../../../src/env";
import { requireRole } from "../../../../src/auth";
import { handleImage } from "../../../../src/bild/image-handler";

// Service is public on the internet: every image request needs a hub session or the x-bild-key API key (AuthError -> 401 via middleware).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  await requireRole(ctx as any, "read");
  return handleImage(ctx);
};
