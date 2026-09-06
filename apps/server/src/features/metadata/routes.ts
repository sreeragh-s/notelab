import { Hono } from "hono";
import { normalizeUrl, readBookmarkMetadata, UnsupportedBookmarkContentError } from "./bookmark-metadata";
import type { AppBindings } from "../../shared/types";

export const metadataRoutes = new Hono<AppBindings>();

metadataRoutes.get("/bookmark", async (c) => {
  if (!c.get("user")) {
    return c.json({ message: "Please sign in to continue." }, 401);
  }

  const url = normalizeUrl(c.req.query("url") ?? "");

  if (!url) {
    return c.json({ message: "A valid http or https URL is required." }, 400);
  }

  try {
    return c.json(await readBookmarkMetadata(url));
  } catch (error) {
    if (error instanceof UnsupportedBookmarkContentError) {
      return c.json({ message: "URL does not point to an HTML page." }, 415);
    }
    return c.json({ message: "Unable to fetch bookmark metadata." }, 502);
  }
});
