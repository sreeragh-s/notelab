import { Layer, ManagedRuntime } from "effect";

export const appMemoMap = Layer.makeMemoMapUnsafe();

const processRuntimes: Array<{ dispose(): Promise<unknown> }> = [];

export function createAppRuntime<R, E>(
  layer: Layer.Layer<R, E, never>,
  options?: { process?: boolean },
) {
  const runtime = ManagedRuntime.make(layer, { memoMap: appMemoMap });
  if (options?.process) processRuntimes.push(runtime);
  return runtime;
}

export async function disposeProcessRuntimes() {
  const pending = processRuntimes.splice(0);
  await Promise.all(pending.map((runtime) => runtime.dispose()));
}
