export function isProtectedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/design") {
    return true;
  }
  if (pathname.startsWith("/vehicles")) {
    return true;
  }
  return pathname.startsWith("/api/reports");
}

export function isAuthPage(pathname: string): boolean {
  return pathname === "/login";
}
