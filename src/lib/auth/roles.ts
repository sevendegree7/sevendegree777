// app roles used after login
export type UserRole = "admin" | "cashier" | "kitchen";

// where each role should land
export const ROLE_HOME: Record<UserRole, string> = {
  admin: "/admin",
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
