import assert from "node:assert/strict";
import { test } from "vitest";
import { Context, Effect, Layer } from "effect";

import { createAppRuntime } from "./runtime";

class Probe extends Context.Service<
  Probe,
  {
    ping(): Effect.Effect<string>;
  }
>()("@zilobase/server/infrastructure/effect/Probe") {
  static readonly layer = Layer.succeed(this, {
    ping: () => Effect.succeed("pong"),
  });
}

test("managed runtime runs a provided service", async () => {
  const runtime = createAppRuntime(Probe.layer);
  const value = await runtime.runPromise(Probe.use((probe) => probe.ping()));
  assert.equal(value, "pong");
  await runtime.dispose();
});
