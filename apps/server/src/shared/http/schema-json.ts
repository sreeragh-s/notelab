import { Effect, Schema, type SchemaAST } from "effect";

import { readJsonBody } from "./request";

type JsonBodyRequest = {
  json(): Promise<unknown>;
};

type JsonSchema<S extends Schema.Top> = S & {
  readonly DecodingServices: never;
};

export function decodeUnknown<S extends Schema.Top>(
  schema: JsonSchema<S>,
  input: unknown,
  options?: SchemaAST.ParseOptions,
) {
  return Schema.decodeUnknownEffect(schema)(input, options);
}

export function parseUnknown<S extends Schema.Top>(
  schema: JsonSchema<S>,
  input: unknown,
  options?: SchemaAST.ParseOptions,
) {
  return Effect.runPromise(
    decodeUnknown(schema, input, options).pipe(
      Effect.match({
        onFailure: (error) => ({
          ok: false as const,
          message: error.message,
        }),
        onSuccess: (data) => ({ ok: true as const, data }),
      }),
    ),
  );
}

export function decodeJsonBody<S extends Schema.Top>(
  request: JsonBodyRequest,
  schema: JsonSchema<S>,
  options?: SchemaAST.ParseOptions,
) {
  return Effect.promise(() => readJsonBody(request)).pipe(
    Effect.flatMap((body) => decodeUnknown(schema, body, options)),
  );
}

export function parseJsonBody<S extends Schema.Top>(
  request: JsonBodyRequest,
  schema: JsonSchema<S>,
  options?: SchemaAST.ParseOptions,
) {
  return Effect.runPromise(
    decodeJsonBody(request, schema, options).pipe(
      Effect.match({
        onFailure: (error) => ({
          ok: false as const,
          message: error.message,
        }),
        onSuccess: (data) => ({ ok: true as const, data }),
      }),
    ),
  );
}
