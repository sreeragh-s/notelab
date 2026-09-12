import { config as loadEnv } from "@dotenvx/dotenvx";
import { defineConfig } from "drizzle-kit";

const loaded: Record<string, string> = {};
loadEnv({
  path: process.env.ZILOBASE_ENV_FILE
    ? [process.env.ZILOBASE_ENV_FILE]
    : ["../../.env.development", "../../.dev/local/env/node.env"],
  processEnv: loaded,
  overload: true,
  quiet: true,
  ignore: ["MISSING_ENV_FILE"],
  noOps: true,
});

export default defineConfig({
  schema: "./src/infrastructure/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? loaded.DATABASE_URL ?? "postgres://localhost:5432/zilobase",
  },
});
