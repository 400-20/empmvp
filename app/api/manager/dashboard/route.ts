import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { AttendanceStatus, CorrectionStatus, LeaveRequestStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.MANAGER || !session.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  const managerId = session.user.id;
  const today = startOfUtcDay(new Date());
   const thirtyDaysAgo = startOfUtcDay(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));

  const [teamSize, pendingLeave, pendingCorrections, todaysAttendance] = await Promise.all([
    prisma.user.count({ where: { orgId, managerId, status: "ACTIVE" } }),
    prisma.leaveRequest.count({ where: { orgId, status: LeaveRequestStatus.PENDING, user: { managerId } } }),
    prisma.correctionRequest.count({
      where: { orgId, status: CorrectionStatus.PENDING, user: { managerId } },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { orgId, workDate: today, user: { managerId } },
      _count: { status: true },
    }),
  ]);

  const attendanceToday = todaysAttendance.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count.status;
    return acc;
  }, {});

  const recentAttendance = await prisma.attendance.findMany({
    where: { orgId, workDate: { gte: thirtyDaysAgo, lte: today }, user: { managerId } },
    select: {
      status: true,
      netMinutes: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
    },
  });

  const summary = recentAttendance.reduce(
    (acc, a) => {
      acc.totalNetMinutes += a.netMinutes ?? 0;
      acc.daysCount += 1;
      if (a.lateMinutes && a.lateMinutes > 0) acc.lateDays += 1;
      if (a.earlyLeaveMinutes && a.earlyLeaveMinutes > 0) acc.earlyLeaveDays += 1;
      if (a.status === AttendanceStatus.PRESENT) acc.presentDays += 1;
      if (a.status === AttendanceStatus.HALF) acc.halfDays += 1;
      if (a.status === AttendanceStatus.LEAVE) acc.leaveDays += 1;
      if (a.status === AttendanceStatus.ABSENT) acc.absentDays += 1;
      return acc;
    },
    {
      daysCount: 0,
      totalNetMinutes: 0,
      lateDays: 0,
      earlyLeaveDays: 0,
      presentDays: 0,
      halfDays: 0,
      leaveDays: 0,
      absentDays: 0,
    },
  );

  return NextResponse.json({
    metrics: {
      teamSize,
      pendingLeave,
      pendingCorrections,
      attendanceToday: {
        present: attendanceToday[AttendanceStatus.PRESENT] ?? 0,
        half: attendanceToday[AttendanceStatus.HALF] ?? 0,
        leave: attendanceToday[AttendanceStatus.LEAVE] ?? 0,
        absent: attendanceToday[AttendanceStatus.ABSENT] ?? 0,
        holiday: attendanceToday[AttendanceStatus.HOLIDAY] ?? 0,
      },
      last30Days: {
        windowDays: 30,
        avgNetMinutes: summary.daysCount ? Math.round(summary.totalNetMinutes / summary.daysCount) : 0,
        lateDays: summary.lateDays,
        earlyLeaveDays: summary.earlyLeaveDays,
        presentDays: summary.presentDays,
        halfDays: summary.halfDays,
        leaveDays: summary.leaveDays,
        absentDays: summary.absentDays,
      },
    },
  });
}
