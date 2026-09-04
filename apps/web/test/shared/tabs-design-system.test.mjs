import { readFile } from "node:fs/promises";

export function register({ readSource, assert, test }) {
  test("all shared tabs use the canonical control, text, spacing, and icon sizes", async () => {
    const [tabsSource, buttonSource, inputSource, sidebarSource, databaseStyles] = await Promise.all([
      readSource("/src/shared/ui/app-tabs.tsx"),
      readSource("/src/shared/ui/button.tsx"),
      readSource("/src/shared/ui/input.tsx"),
      readSource("/src/shared/ui/sidebar.tsx"),
      readSource("/src/features/databases/styles/database.css"),
    ]);

    assert.match(buttonSource, /const buttonControlHeightClassName = "h-8"/);
    assert.match(
      buttonSource,
      /default:\s*\n?\s*`\$\{buttonControlHeightClassName\} gap-1\.5 px-2\.5/,
    );
    assert.match(
      tabsSource,
      /buttonControlHeightClassName,[\s\S]*?gap-2[\s\S]*?px-3[\s\S]*?text-sm[\s\S]*?\[&_svg:not\(\[class\*='size-'\]\)\]:size-4/,
    );
    assert.doesNotMatch(
      tabsSource,
      /h-7[\s\S]*?text-xs[\s\S]*?\[&_svg:not\(\[class\*='size-'\]\)\]:size-3\.5/,
    );
    assert.match(tabsSource, /data-active:bg-action-neutral-hover/);
    assert.match(tabsSource, /aria-\[current=page\]:bg-action-neutral-hover/);
    assert.match(tabsSource, /aria-\[current=page\]:active:bg-action-neutral-pressed/);
    assert.match(tabsSource, /rounded-lg p-0/);
    assert.match(buttonSource, /icon: "size-8/);
    assert.match(inputSource, /buttonControlHeightClassName,[\s\S]*?"w-full/);
    assert.match(sidebarSource, /buttonControlHeightClassName,[\s\S]*?peer\/menu-button/);
    assert.match(databaseStyles, /\.database-new-button\s*\{\s*@apply h-8/);
    assert.doesNotMatch(tabsSource, /TabsPrimitive\.Indicator|tab-indicator/);
  });
}
