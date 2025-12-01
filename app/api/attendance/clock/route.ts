import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { BreakType, Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeAttendanceMetrics } from "@/lib/timecalc";

const breakTypeSchema = z.enum([BreakType.LUNCH, BreakType.EXTERNAL]);

const payloadSchema = z.object({
  action: z.enum(["clock-in", "clock-out", "break-in", "break-out"]),
  breakType: breakTypeSchema.optional(),
  timestamp: z.string().datetime().optional(),
});

const allowedRoles: UserRole[] = [UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.ORG_ADMIN];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function recomputeAttendance(attendanceId: string, orgId: string) {
  const [attendance, org] = await Promise.all([
    prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { breaks: true },
    }),
    prisma.organization.findUnique({ where: { id: orgId } }),
  ]);

  if (!attendance || !org) return;

  const metrics = computeAttendanceMetrics(attendance as Prisma.AttendanceGetPayload<{ include: { breaks: true } }>, org);
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      netMinutes: metrics.netMinutes,
      externalBreakMinutes: metrics.externalBreakMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      status: metrics.status,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!allowedRoles.includes(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session.user.orgId) {
    return NextResponse.json({ error: "Missing organisation context" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const { action, breakType, timestamp } = parsed.data;
  const now = timestamp ? new Date(timestamp) : new Date();
  const workDate = startOfUtcDay(now);
  const orgId = session.user.orgId;
  const userId = session.user.id;

  const attendance = await prisma.attendance.upsert({
    where: {
      orgId_userId_workDate: {
        orgId,
        userId,
        workDate,
      },
    },
    update: {},
    create: {
      orgId,
      userId,
      workDate,
    },
    include: { breaks: true },
  });

  if (action === "clock-in") {
    if (attendance.clockIn) {
      return NextResponse.json({ error: "Already clocked in" }, { status: 400 });
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockIn: now },
      include: { breaks: true },
    });
    return NextResponse.json({ attendance: updated });
  }

  if (action === "clock-out") {
    if (!attendance.clockIn) {
      return NextResponse.json({ error: "Clock-in required before clock-out" }, { status: 400 });
    }

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: now },
      include: { breaks: true },
    });
    await recomputeAttendance(updated.id, orgId);
    return NextResponse.json({ attendance: updated });
  }

  if (action === "break-in") {
    const type = breakType ?? BreakType.EXTERNAL;
    const openBreak = attendance.breaks.find((b) => !b.end && b.type === type);
    if (openBreak) {
      return NextResponse.json({ error: "Break already started" }, { status: 400 });
    }

    const createdBreak = await prisma.break.create({
      data: {
        orgId,
        attendanceId: attendance.id,
        userId,
        type,
        start: now,
      },
    });

    await recomputeAttendance(attendance.id, orgId);
    return NextResponse.json({ attendanceId: attendance.id, break: createdBreak });
  }

  if (action === "break-out") {
    const type = breakType ?? BreakType.EXTERNAL;
    const openBreak = await prisma.break.findFirst({
      where: { attendanceId: attendance.id, end: null, type },
      orderBy: { start: "desc" },
    });

    if (!openBreak) {
      return NextResponse.json({ error: "No active break to end" }, { status: 400 });
    }

    const updatedBreak = await prisma.break.update({
      where: { id: openBreak.id },
      data: {
        end: now,
      },
    });

    await recomputeAttendance(attendance.id, orgId);
    return NextResponse.json({ attendanceId: attendance.id, break: updatedBreak });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
