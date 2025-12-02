import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { AttendanceStatus, UserRole, UserStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.ORG_ADMIN || !session.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.orgId;
  const today = startOfUtcDay(new Date());
  const last30 = startOfUtcDay(new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30));

  const [usersActive, managers, employees, orgAdmins, pendingLeave, pendingCorrections, todaysAttendance, last30Attendance] =
    await Promise.all([
      prisma.user.count({ where: { orgId, status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { orgId, role: UserRole.MANAGER, status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { orgId, role: UserRole.EMPLOYEE, status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { orgId, role: UserRole.ORG_ADMIN, status: UserStatus.ACTIVE } }),
      prisma.leaveRequest.count({ where: { orgId, status: "PENDING" } }),
      prisma.correctionRequest.count({ where: { orgId, status: "PENDING" } }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: { orgId, workDate: today },
        _count: { status: true },
      }),
      prisma.attendance.findMany({
        where: { orgId, workDate: { gte: last30, lte: today } },
        select: { status: true, netMinutes: true, lateMinutes: true, earlyLeaveMinutes: true },
      }),
    ]);

  const attendanceToday = todaysAttendance.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count.status;
    return acc;
  }, {});

  const last30Agg = last30Attendance.reduce(
    (acc, a) => {
      acc.days += 1;
      acc.netMinutes += a.netMinutes ?? 0;
      if (a.lateMinutes && a.lateMinutes > 0) acc.lateDays += 1;
      if (a.earlyLeaveMinutes && a.earlyLeaveMinutes > 0) acc.earlyDays += 1;
      if (a.status === AttendanceStatus.PRESENT) acc.present += 1;
      if (a.status === AttendanceStatus.HALF) acc.half += 1;
      if (a.status === AttendanceStatus.LEAVE) acc.leave += 1;
      if (a.status === AttendanceStatus.ABSENT) acc.absent += 1;
      if (a.status === AttendanceStatus.HOLIDAY) acc.holiday += 1;
      return acc;
    },
    { days: 0, netMinutes: 0, lateDays: 0, earlyDays: 0, present: 0, half: 0, leave: 0, absent: 0, holiday: 0 },
  );

  return NextResponse.json({
    metrics: {
      usersActive,
      managers,
      employees,
      orgAdmins,
      pendingLeave,
      pendingCorrections,
      last30Days: {
        windowDays: 30,
        avgNetMinutes: last30Agg.days ? Math.round(last30Agg.netMinutes / last30Agg.days) : 0,
        lateDays: last30Agg.lateDays,
        earlyLeaveDays: last30Agg.earlyDays,
        presentDays: last30Agg.present,
        halfDays: last30Agg.half,
        leaveDays: last30Agg.leave,
        absentDays: last30Agg.absent,
        holidayDays: last30Agg.holiday,
      },
      attendanceToday: {
        present: attendanceToday[AttendanceStatus.PRESENT] ?? 0,
        half: attendanceToday[AttendanceStatus.HALF] ?? 0,
        leave: attendanceToday[AttendanceStatus.LEAVE] ?? 0,
        absent: attendanceToday[AttendanceStatus.ABSENT] ?? 0,
        holiday: attendanceToday[AttendanceStatus.HOLIDAY] ?? 0,
      },
    },
  });
}
