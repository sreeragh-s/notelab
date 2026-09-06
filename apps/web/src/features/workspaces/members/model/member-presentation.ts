export function getInitials(value: string) {
  const parts = value.trim().split(/\s+/);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials || "?";
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "soon";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
