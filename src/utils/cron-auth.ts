import { timingSafeEqual } from "@/utils/html";

export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string,
): boolean {
  if (!authorizationHeader) {
    return false;
  }
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return false;
  }
  return timingSafeEqual(token, cronSecret);
}
