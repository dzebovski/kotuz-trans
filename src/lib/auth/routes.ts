export function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  return pathname.startsWith("/api/reports");
}

export function isAuthPage(pathname: string): boolean {
  return pathname === "/login";
}
