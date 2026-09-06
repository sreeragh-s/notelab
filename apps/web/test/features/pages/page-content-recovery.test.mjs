export function register({ assert, loadModule, test }) {
  test("content recovery restores meaningful saved blocks but preserves live editor content", async () => {
    const { recoverPageEditorContent } = await loadModule("/src/features/pages/pane/page-content-recovery.ts");
    const saved = { type: "doc", content: [{ type: "databaseBlock", attrs: { databaseId: "db" } }] };
    let content = { type: "doc", content: [{ type: "paragraph" }] };
    let writes = 0;
    const handle = { getContentJson: () => content, setContentJson: next => { writes++; content = next; return true; } };
    assert.deepEqual(recoverPageEditorContent(handle, saved), { content: saved });
    assert.equal(writes, 1);
    assert.deepEqual(recoverPageEditorContent(handle, { type: "doc" }), { content: saved });
    assert.equal(writes, 1);
  });
  test("content recovery stops on a refused write and uses saved content when readback is unavailable", async () => {
    const { recoverPageEditorContent } = await loadModule("/src/features/pages/pane/page-content-recovery.ts");
    const saved = { type: "meetingBlock" };
    assert.equal(recoverPageEditorContent({ getContentJson: () => null, setContentJson: () => false }, saved), null);
    assert.deepEqual(recoverPageEditorContent({ getContentJson: () => null, setContentJson: () => true }, saved), { content: saved });
  });
  test("page editability preserves comment grants, locks, read-only views and trash", async () => {
    const { resolvePageEditability } = await loadModule("/src/features/pages/pane/page-editability.ts");
    const base = { accessLevel: "edit", deletedAt: null, locked: false, readOnly: false };
    assert.deepEqual(resolvePageEditability(base), { pageEditable: true, commentsEditable: true });
    assert.deepEqual(resolvePageEditability({ ...base, accessLevel: "comment" }), { pageEditable: false, commentsEditable: true });
    assert.deepEqual(resolvePageEditability({ ...base, locked: true }), { pageEditable: false, commentsEditable: true });
    for (const patch of [{ readOnly: true }, { deletedAt: "deleted" }, { accessLevel: "view" }, { accessLevel: undefined }]) {
      assert.deepEqual(resolvePageEditability({ ...base, ...patch }), { pageEditable: false, commentsEditable: false });
    }
  });
}
