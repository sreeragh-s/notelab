import { expect, it } from "vitest";
import { localSocketAllowed, setLocalServicePorts } from "./network-boundary";
it("allows only the installation socket and configured loopback service ports", () => {
  setLocalServicePorts([11434, 8080]);
  expect(localSocketAllowed({ path: "/tmp/local-db/.s.PGSQL.5432" }, "/tmp/local-db")).toBe(true);
  expect(localSocketAllowed({ host: "127.0.0.1", port: 11434 }, "/tmp/local-db")).toBe(true);
  for (const value of [{ host: "example.com", port: 11434 }, { host: "127.0.0.1", port: 443 }, { host: "localhost", port: 8080 }, { path: "/tmp/another-db/.s.PGSQL.5432" }]) expect(localSocketAllowed(value, "/tmp/local-db")).toBe(false);
  expect(() => setLocalServicePorts([0])).toThrow();
});
