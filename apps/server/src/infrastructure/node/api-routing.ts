const apiPathPrefixes = [
  "/.well-known",
  "/api",
  "/agents",
  "/automation-slack",
  "/session",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/email-otp",
  "/workspace",
  "/workspaces",
  "/search",
  "/pages",
  "/page-guest-invitations",
  "/page-layouts",
  "/databases",
  "/demo",
  "/desktop",
  "/images",
  "/mail",
  "/metadata",
  "/meetings",
  "/user-settings",
  "/comments",
  "/health",
  "/ready",
];

export function isNodeApiPath(pathname: string) {
  return apiPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
