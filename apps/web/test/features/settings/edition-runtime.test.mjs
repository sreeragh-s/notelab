export function register({ assert, loadModule, test }) {
  test("the community edition alias resolves its runtime module", async () => {
    const { editionWebModule } = await loadModule("@zilobase/edition-web");
    assert.deepEqual(editionWebModule, {
      routePrefix: "/_edition",
      additionalLoginMethods: [],
      components: {},
      navigation: [],
      routes: [],
      settingsSections: [],
    });
  });
}
