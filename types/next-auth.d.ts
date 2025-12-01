import { OrgStatus, UserRole, UserStatus } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: UserRole;
      orgId?: string | null;
      managerId?: string | null;
      status: UserStatus;
      orgStatus?: OrgStatus;
    };
  }

  interface User {
    role: UserRole;
    orgId?: string | null;
    managerId?: string | null;
    status: UserStatus;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    orgId?: string | null;
    managerId?: string | null;
    status: UserStatus;
    orgStatus?: OrgStatus;
  }
}
