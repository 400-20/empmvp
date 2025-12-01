import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const roleRank = {
  SUPERADMIN: 3,
  ORG_ADMIN: 2,
  MANAGER: 1,
  EMPLOYEE: 0,
};

type Role = keyof typeof roleRank;

function requiredRole(pathname: string): Role | null {
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/api/superadmin")) {
    return "SUPERADMIN";
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/orgs")) {
    return "ORG_ADMIN";
  }
  if (pathname.startsWith("/manager") || pathname.startsWith("/api/manager")) {
    return "MANAGER";
  }
  if (
    pathname.startsWith("/employee") ||
    pathname.startsWith("/api/attendance") ||
    pathname.startsWith("/api/employee") ||
    pathname.startsWith("/leave")
  ) {
    return "EMPLOYEE";
  }
  return null;
}

function hasAccess(userRole: Role, needed: Role) {
  return roleRank[userRole] >= roleRank[needed];
}

export default withAuth(
  function middleware(req) {
    if (req.nextUrl.pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    const required = requiredRole(req.nextUrl.pathname);
    const token = req.nextauth.token;

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
    }

    const tokenStatus = (token as any).status;
    if (tokenStatus && tokenStatus !== "ACTIVE") {
      return NextResponse.redirect(new URL("/unauthorized", req.nextUrl.origin));
    }

    const orgStatus = (token as any).orgStatus;
    if ((token as any).role !== "SUPERADMIN" && orgStatus && orgStatus !== "ACTIVE") {
      return NextResponse.redirect(new URL("/unauthorized", req.nextUrl.origin));
    }

    if (required) {
      const role = token.role as Role;
      if (!hasAccess(role, required)) {
        return NextResponse.redirect(new URL("/unauthorized", req.nextUrl.origin));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/superadmin/:path*",
    "/admin/:path*",
    "/manager/:path*",
    "/employee/:path*",
    "/api/:path*",
  ],
};
