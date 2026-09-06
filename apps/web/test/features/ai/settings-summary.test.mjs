export function register({ assert, loadModule, test }) {
  test("draft summaries group changed fields and preserve pending review changes", async () => {
    const { settingsDraftSummary } = await loadModule(
      "/src/features/ai/settings/model/draft-summary.ts",
    );
    assert.deepEqual(settingsDraftSummary(undefined), {
      changedFields: [],
      changedTabs: [],
      dirty: false,
    });
    const definition = {
      name: "Agent",
      description: "Description",
      icon: null,
      cover: null,
      iconPosition: "inline",
      instructions: "",
      instructionDocument: {},
      triggers: [],
      resources: [],
      grants: [],
      connectors: [],
    };
    const state = { definition, saved: structuredClone(definition) };
    assert.equal(settingsDraftSummary(state).dirty, false);
    const changed = settingsDraftSummary({
      ...state,
      definition: { ...definition, name: "Renamed", description: "Changed" },
    });
    assert.equal(changed.dirty, true);
    assert.ok(changed.changedFields.includes("name"));
    assert.ok(changed.changedFields.includes("description"));
    assert.equal(changed.changedTabs.length, new Set(changed.changedTabs).size);
    const reviewed = settingsDraftSummary({
      ...state,
      review: { before: definition, after: definition, fields: ["name"] },
    });
    assert.equal(reviewed.dirty, true);
    assert.equal(state.definition.name, "Agent");
  });
}
