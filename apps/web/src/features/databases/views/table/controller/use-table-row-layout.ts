import { areRowLayoutsEqual, measureTableRowLayout } from "../model/table-row-layout"
import { useCallback, useEffect, useRef, useState } from "react";

import { type RowLayout } from "../model/database-table-model";

import type { RefObject } from "react"

export function useTableRowLayout({
  tableWrapRef,
  tableScrollRef,
  isInlineTableScrollEnabled,
}: {
  tableWrapRef: RefObject<HTMLDivElement | null>
  tableScrollRef: RefObject<HTMLDivElement | null>
  isInlineTableScrollEnabled: boolean
}) {
  const [rowLayout, setRowLayout] = useState<RowLayout>({
    centers: {},
    dropTops: [],
    heights: {},
  })
  const rowLayoutRef = useRef(rowLayout)
  rowLayoutRef.current = rowLayout
  const getRowElements = useCallback(() => {
    return Array.from(
      tableWrapRef.current?.querySelectorAll<HTMLTableRowElement>(
        ".database-table tbody tr[data-database-row-id]"
      ) ?? []
    )
  }, [])
  const getRowLayoutElement = useCallback(() => {
    const wrapperElement = tableWrapRef.current

    if (!isInlineTableScrollEnabled) {
      return wrapperElement
    }

    return (
      tableScrollRef.current?.querySelector<HTMLElement>(
        ".database-table-scroll-content"
      ) ?? wrapperElement
    )
  }, [isInlineTableScrollEnabled])
  const measureRows = useCallback(() => {
    const layoutElement = getRowLayoutElement()

    if (!layoutElement) {
      const emptyLayout = { centers: {}, dropTops: [], heights: {} }
      rowLayoutRef.current = emptyLayout
      return emptyLayout
    }

    const nextLayout = measureTableRowLayout(layoutElement, getRowElements())
    rowLayoutRef.current = nextLayout

    setRowLayout((currentLayout) =>
      areRowLayoutsEqual(currentLayout, nextLayout) ? currentLayout : nextLayout
    )

    return nextLayout
  }, [getRowElements, getRowLayoutElement])
  useEffect(() => {
    window.addEventListener("resize", measureRows)
    const resizeObserver = new ResizeObserver(() => measureRows())
    const wrapperElement = tableWrapRef.current

    if (wrapperElement) {
      resizeObserver.observe(wrapperElement)
    }

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", measureRows)
    }
  }, [measureRows])
  return {
    rowLayout,
    rowLayoutRef,
    getRowLayoutElement,
    measureRows,
  }
}
