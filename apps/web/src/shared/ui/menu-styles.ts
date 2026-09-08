// View Settings is the visual baseline for action menus and option lists.
// Keep popup geometry separate from item behavior (Radix menu, select or popover).
export const menuSurfaceClassName =
  "rounded-lg bg-surface-overlay text-content-primary shadow-md ring-1 ring-stroke-default"

export const menuViewportClassName =
  "max-h-[min(36rem,calc(100vh-1rem),var(--radix-dropdown-menu-content-available-height,100vh),var(--radix-select-content-available-height,100vh),var(--radix-context-menu-content-available-height,100vh),var(--radix-popover-content-available-height,100vh))] max-w-[min(20rem,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto overscroll-contain"

export const menuItemClassName =
  "relative my-0.5 flex min-h-7 cursor-default items-center gap-2 rounded-md px-2 py-1 text-[13px]/relaxed outline-hidden select-none focus:bg-action-neutral-hover focus:text-action-on-neutral data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"

export const menuLabelClassName =
  "px-2 py-1.5 text-xs text-content-secondary"

export const menuSeparatorClassName = "-mx-1 my-1 h-px bg-stroke-default"
