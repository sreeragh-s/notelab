export function mailPropertyLabel(
  id: string,
  custom: { name: string } | undefined,
  system: { label: string } | undefined,
) {
  return custom?.name ?? system?.label ?? id;
}
