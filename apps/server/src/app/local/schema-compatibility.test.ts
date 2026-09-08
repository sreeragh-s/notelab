import { describe, expect, it } from "vitest";
import { assertLocalSchemaPrefix } from "./schema-compatibility";
describe("local schema compatibility", () => {
  it("accepts fresh installs, the current schema and forward upgrades", () => {
    expect(() => assertLocalSchemaPrefix([], ["a"])).not.toThrow();
    expect(() => assertLocalSchemaPrefix(["a"], ["a"])).not.toThrow();
    expect(() => assertLocalSchemaPrefix(["a"], ["a", "b"])).not.toThrow();
  });
  it("rejects downgrades, edited histories and divergent migrations", () => {
    expect(() => assertLocalSchemaPrefix(["a", "b"], ["a"])).toThrow("newer");
    expect(() => assertLocalSchemaPrefix(["x"], ["a", "b"])).toThrow("preserved");
    expect(() => assertLocalSchemaPrefix(["b", "a"], ["a", "b"])).toThrow();
  });
});
