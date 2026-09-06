export function register({ assert, loadModule, test }) {
  test('table row measurement preserves relative centers, heights and terminal drop position', async () => {
    const { measureTableRowLayout, areRowLayoutsEqual } = await loadModule('/src/features/databases/views/table/model/table-row-layout.ts')
    const layout = { getBoundingClientRect: () => ({ top: 50 }), querySelector: () => null }
    const row = (id, top, height) => ({ dataset: { databaseRowId: id }, getBoundingClientRect: () => ({ top, height }) })
    const measured = measureTableRowLayout(layout, [row('a', 60, 20), row('b', 80, 40)])
    assert.deepEqual(measured, { centers: { a: 20, b: 50 }, heights: { a: 20, b: 40 }, dropTops: [10, 30, 70] })
    assert.equal(areRowLayoutsEqual(measured, structuredClone(measured)), true)
    assert.equal(areRowLayoutsEqual(measured, { ...measured, heights: { a: 21, b: 40 } }), false)
    assert.deepEqual(measureTableRowLayout({ ...layout, querySelector: () => ({ getBoundingClientRect: () => ({ top: 85 }) }) }, []), { centers: {}, heights: {}, dropTops: [35] })
    assert.deepEqual(measureTableRowLayout(layout, []), { centers: {}, heights: {}, dropTops: [] })
  })

  test('column keys preserve pending insertion side and structural editing gate', async () => {
    const { getTableColumnKeys } = await loadModule('/src/features/databases/views/table/model/database-table-model.ts')
    assert.deepEqual(getTableColumnKeys({ columnIds: ['name', 'p1'], canEditStructure: false, pendingInsert: null }), ['name', 'p1'])
    const left = getTableColumnKeys({ columnIds: ['name', 'p1'], canEditStructure: false, pendingInsert: { sourceColumnKey: 'p1', side: 'left', position: 1 } })
    const right = getTableColumnKeys({ columnIds: ['name', 'p1'], canEditStructure: false, pendingInsert: { sourceColumnKey: 'p1', side: 'right', position: 2 } })
    assert.equal(left[2], 'p1')
    assert.equal(right[1], 'p1')
    assert.equal(left.length, 3)
    assert.equal(right.length, 3)
    assert.equal(getTableColumnKeys({ columnIds: ['name'], canEditStructure: true, pendingInsert: null }).length, 2)
  })
}
