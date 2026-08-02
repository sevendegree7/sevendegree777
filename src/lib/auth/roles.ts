// app roles used after login
export type UserRole = "admin" | "cashier" | "kitchen";

// where each role should land
export const ROLE_HOME: Record<UserRole, string> = {
  admin: "/admin",
  cashier: "/pos",
  kitchen: "/kds",
};

// where each role lands when the tablet has no internet.
//
// not the same list: /admin is reports and stock levels, every one of which is
// a question only the server can answer, and there is no copy of that page on
// the tablet. an owner carrying on with no internet is standing at the till,
// so that is where they go.
export const ROLE_OFFLINE_HOME: Record<UserRole, string> = {
  admin: "/pos",
  cashier: "/pos",
  kitchen: "/kds",
};

// which routes each role can open
export const ROLE_ALLOWED_ROUTES: Record<UserRole, string[]> = {
  admin: ["/admin", "/pos", "/kds"],
  cashier: ["/pos"],
  kitchen: ["/kds"],
};

export function isUserRole(value: string): value is UserRole {
  return value === "admin" || value === "cashier" || value === "kitchen";
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const allowed = ROLE_ALLOWED_ROUTES[role];
  return allowed.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
