import { Effect } from "effect";
import { Hono } from "hono";
import { readBookmarkMetadata } from "./bookmark-metadata";
import type { AppBindings } from "../../shared/types";

export const metadataRoutes = new Hono<AppBindings>();

metadataRoutes.get("/bookmark", async (c) => {
  if (!c.get("user")) {
    return c.json({ message: "Please sign in to continue." }, 401);
  }

  const result = await Effect.runPromise(
    readBookmarkMetadata(c.req.query("url") ?? "").pipe(
      Effect.map((body) => ({ status: 200 as const, body })),
      Effect.catchTag("InvalidBookmarkUrl", () =>
        Effect.succeed({
          status: 400 as const,
          body: { message: "A valid http or https URL is required." },
        }),
      ),
      Effect.catchTag("UnsupportedBookmarkContent", () =>
        Effect.succeed({
          status: 415 as const,
          body: { message: "URL does not point to an HTML page." },
        }),
      ),
      Effect.catchTag("BookmarkFetchFailed", () =>
        Effect.succeed({
          status: 502 as const,
          body: { message: "Unable to fetch bookmark metadata." },
        }),
      ),
    ),
  );

  return c.json(result.body, result.status);
});
