import assert from "node:assert/strict";
import { test } from "vitest";
import { Effect } from "effect";

import { decodeBookmarkUrl } from "./bookmark-metadata";

test("bookmark URL schema accepts public hosts and rejects private ones", async () => {
  assert.equal(
    await Effect.runPromise(decodeBookmarkUrl("example.test/path")),
    "https://example.test/path",
  );
  assert.equal(
    await Effect.runPromise(decodeBookmarkUrl(" https://example.test ")),
    "https://example.test/",
  );

  await assert.rejects(() => Effect.runPromise(decodeBookmarkUrl("")));
  await assert.rejects(() => Effect.runPromise(decodeBookmarkUrl("localhost")));
  await assert.rejects(() => Effect.runPromise(decodeBookmarkUrl("127.0.0.1")));
});
