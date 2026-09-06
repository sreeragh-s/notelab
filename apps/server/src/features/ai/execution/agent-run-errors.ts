export class PermanentAgentRunError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
