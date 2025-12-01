import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { CorrectionStatus, LeaveRequestStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

type Notification = { id: string; message: string; type: "info" | "warning" | "success" };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notifications: [] });

  const orgId = session.user.orgId;
  const role = session.user.role as UserRole;

  const notifications: Notification[] = [];

  if (!orgId && role !== UserRole.SUPERADMIN) {
    return NextResponse.json({ notifications });
  }

  if (role === UserRole.SUPERADMIN) {
    const pendingOrgs = await prisma.organization.count({ where: { status: "SUSPENDED" } });
    if (pendingOrgs > 0) {
      notifications.push({
        id: "superadmin-suspended-orgs",
        message: `${pendingOrgs} org(s) suspended. Review or delete as needed.`,
        type: "warning",
      });
    }
    return NextResponse.json({ notifications });
  }

  if (role === UserRole.ORG_ADMIN && orgId) {
    const [pendingLeave, pendingCorrections] = await Promise.all([
      prisma.leaveRequest.count({ where: { orgId, status: LeaveRequestStatus.PENDING } }),
      prisma.correctionRequest.count({ where: { orgId, status: CorrectionStatus.PENDING } }),
    ]);
    if (pendingLeave > 0) {
      notifications.push({
        id: "pending-leave",
        message: `${pendingLeave} leave request(s) awaiting decision`,
        type: "info",
      });
    }
    if (pendingCorrections > 0) {
      notifications.push({
        id: "pending-corrections",
        message: `${pendingCorrections} correction request(s) need review`,
        type: "warning",
      });
    }
  } else if (role === UserRole.MANAGER && orgId) {
    const [pendingLeave, pendingCorrections] = await Promise.all([
      prisma.leaveRequest.count({ where: { orgId, status: LeaveRequestStatus.PENDING, user: { managerId: session.user.id } } }),
      prisma.correctionRequest.count({
        where: { orgId, status: CorrectionStatus.PENDING, user: { managerId: session.user.id } },
      }),
    ]);
    if (pendingLeave > 0) {
      notifications.push({
        id: "team-pending-leave",
        message: `${pendingLeave} team leave request(s) awaiting your decision`,
        type: "info",
      });
    }
    if (pendingCorrections > 0) {
      notifications.push({
        id: "team-pending-corrections",
        message: `${pendingCorrections} team correction request(s) need your review`,
        type: "warning",
      });
    }
  } else if (role === UserRole.EMPLOYEE && orgId) {
    const recentWindow = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14); // last 14 days
    const [leavePending, correctionsPending, rejectedRecent] = await Promise.all([
      prisma.leaveRequest.count({ where: { orgId: orgId as string, userId: session.user.id, status: LeaveRequestStatus.PENDING } }),
      prisma.correctionRequest.count({ where: { orgId: orgId as string, userId: session.user.id, status: CorrectionStatus.PENDING } }),
      prisma.leaveRequest.count({
        where: {
          orgId: orgId as string,
          userId: session.user.id,
          status: LeaveRequestStatus.REJECTED,
          decidedAt: { gte: recentWindow },
        },
      }),
    ]);
    if (leavePending > 0) {
      notifications.push({
        id: "self-leave-pending",
        message: `You have ${leavePending} leave request(s) pending`,
        type: "info",
      });
    }
    if (correctionsPending > 0) {
      notifications.push({
        id: "self-corrections-pending",
        message: `You have ${correctionsPending} correction request(s) pending`,
        type: "info",
      });
    }
    if (rejectedRecent > 0) {
      notifications.push({
        id: "leave-rejected",
        message: `${rejectedRecent} leave request(s) were rejected recently`,
        type: "warning",
      });
    }
  }

  return NextResponse.json({ notifications });
}
