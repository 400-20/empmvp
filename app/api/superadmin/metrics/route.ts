import { ensureSuperadmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { OrgStatus, UserRole, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const [
    orgsTotal,
    orgsActive,
    orgsSuspended,
    orgsDeleted,
    usersTotal,
    usersActive,
    orgAdminsActive,
    managersActive,
    employeesActive,
    screenshotsTotal,
    auditCount,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: OrgStatus.ACTIVE } }),
    prisma.organization.count({ where: { status: OrgStatus.SUSPENDED } }),
    prisma.organization.count({ where: { status: OrgStatus.DELETED } }),
    prisma.user.count({ where: { role: { not: UserRole.SUPERADMIN } } }),
    prisma.user.count({
      where: { status: UserStatus.ACTIVE, role: { not: UserRole.SUPERADMIN } },
    }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, role: UserRole.ORG_ADMIN } }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, role: UserRole.MANAGER } }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, role: UserRole.EMPLOYEE } }),
    prisma.screenshot.count(),
    prisma.auditLog.count(),
  ]);

  const recentOrgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      name: true,
      status: true,
      planName: true,
      createdAt: true,
      userLimit: true,
      screenshotLimit: true,
      retentionDays: true,
    },
  });

  return NextResponse.json({
    summary: {
      orgsTotal,
      orgsActive,
      orgsSuspended,
      orgsDeleted,
      usersTotal,
      usersActive,
      orgAdminsActive,
      managersActive,
      employeesActive,
      screenshotsTotal,
      auditCount,
    },
    recentOrgs,
  });
}
