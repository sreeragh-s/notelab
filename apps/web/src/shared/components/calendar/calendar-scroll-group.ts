/** DOM scroll synchronization stays outside React rendering and is local to one surface. */
export function createCalendarScrollGroup(initialTop = 7 * 48) {
  const elements = new Set<HTMLElement>();
  let top = initialTop;
  return {
    register(element: HTMLElement) {
      elements.add(element); element.scrollTop = top;
      return () => { elements.delete(element); };
    },
    scrollTo(next: number) {
      top = Math.max(0, next);
      for (const element of elements) if (element.scrollTop !== top) element.scrollTop = top;
    },
    scrollBy(delta: number) { this.scrollTo(top + delta); },
  };
}
export type CalendarScrollGroup = ReturnType<typeof createCalendarScrollGroup>;
