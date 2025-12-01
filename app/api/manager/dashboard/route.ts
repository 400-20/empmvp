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
    },
  });
}
