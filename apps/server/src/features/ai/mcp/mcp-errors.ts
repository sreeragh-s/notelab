export class McpServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
  ) {
    super(message);
    this.name = "McpServiceError";
  }
}
