import { describe, expect, it } from "vitest";

import { classifyAgentMessage } from "./agent-conversation-service";
import {
  compileAgentDefinition,
  computeNextAgentSchedule,
  hashAgentDefinition,
  normalizeAgentDefinition,
} from "./agent-definition";

describe("standalone Custom Agent definitions", () => {
  it("normalizes bounded defaults and compiles saved instructions", () => {
    const definition = normalizeAgentDefinition({
      instructions: "  Read granted project pages only.  ",
      name: "  Release agent  ",
    });

    expect(definition.name).toBe("Release agent");
    expect(definition.defaultModel).toBe("auto");
    expect(definition.safeExecutionPreferences).toEqual({});
    expect(definition.triggers).toEqual([]);
    expect(compileAgentDefinition(definition).systemInstructions).toBe(
      "Read granted project pages only.",
    );
  });

  it("hashes definitions canonically regardless of object key insertion order", () => {
    const left = normalizeAgentDefinition({ name: "Agent", description: "A" });
    const right = normalizeAgentDefinition({ description: "A", name: "Agent" });
    expect(hashAgentDefinition(left)).toBe(hashAgentDefinition(right));
    expect(hashAgentDefinition(left)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("computes portable schedule occurrences", () => {
    const from = new Date("2026-09-05T00:00:00.000Z");
    expect(computeNextAgentSchedule({ cadence: "daily" }, from).toISOString()).toBe("2026-09-06T00:00:00.000Z");
    expect(computeNextAgentSchedule({ cadence: "custom", intervalMinutes: 60 }, from).toISOString()).toBe("2026-09-05T01:00:00.000Z");
  });
});

describe("Custom Agent builder intent", () => {
  it.each([
    ["Instructions: review release notes", "configure"],
    ["Rename this agent to Release reviewer", "configure"],
    ["Run the agent now", "run"],
    ["Use the GitHub connector to identify my username", "run"],
    ["Update the project page with today's status", "run"],
    ["From now on summarize releases, then run it now", "configure_and_run"],
    ["Can you help me with this?", "clarify"],
  ])("classifies %s as %s", (message, intent) => {
    expect(classifyAgentMessage(message)).toBe(intent);
  });
});
