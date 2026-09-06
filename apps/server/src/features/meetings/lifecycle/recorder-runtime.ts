import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

export async function runRecorderRuntimeMutation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /another collaborator|recorder lease|active recording|previous recording|cannot (?:pause|resume|start|stop)/i.test(
        message,
      )
    ) {
      throw new ServiceMutationError(message, 409);
    }
    throw error;
  }
}
