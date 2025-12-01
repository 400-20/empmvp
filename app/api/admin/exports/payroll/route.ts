import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.ORG_ADMIN || !session.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);

  const attendances = await prisma.attendance.findMany({
    where: { orgId: session.user.orgId, workDate: { gte: start, lte: end } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      orgId: session.user.orgId,
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    include: { leaveType: { select: { code: true } }, user: { select: { id: true } } },
  });

  type Row = {
    userId: string;
    name: string;
    email: string;
    presentDays: number;
    halfDays: number;
    leaveDays: number;
    absentDays: number;
    netMinutes: number;
    externalBreakMinutes: number;
    overtimeMinutes: number;
    leaveByType: Record<string, number>;
  };

  const rows = new Map<string, Row>();

  attendances.forEach((a) => {
    if (!rows.has(a.userId)) {
      rows.set(a.userId, {
        userId: a.userId,
        name: a.user.name ?? "",
        email: a.user.email,
        presentDays: 0,
        halfDays: 0,
        leaveDays: 0,
        absentDays: 0,
        netMinutes: 0,
        externalBreakMinutes: 0,
        overtimeMinutes: 0,
        leaveByType: {},
      });
    }
    const row = rows.get(a.userId)!;
    row.netMinutes += a.netMinutes ?? 0;
    row.externalBreakMinutes += a.externalBreakMinutes ?? 0;
    row.overtimeMinutes += a.overtimeMinutes ?? 0;
    if (a.status === "PRESENT") row.presentDays += 1;
    if (a.status === "HALF") row.halfDays += 1;
    if (a.status === "LEAVE") row.leaveDays += 1;
    if (a.status === "ABSENT") row.absentDays += 1;
  });

  leaveRequests.forEach((lr) => {
    const row = rows.get(lr.userId);
    if (!row) return;
    const code = lr.leaveType.code;
    const days = Math.max(
      1,
      Math.ceil((Math.min(end.getTime(), lr.endDate.getTime()) - Math.max(start.getTime(), lr.startDate.getTime())) / (1000 * 60 * 60 * 24)) + 1,
    );
    row.leaveByType[code] = (row.leaveByType[code] ?? 0) + days;
  });

  const header = [
    "Employee",
    "Email",
    "PresentDays",
    "HalfDays",
    "LeaveDays",
    "AbsentDays",
    "NetMinutes",
    "ExternalBreakMinutes",
    "OvertimeMinutes",
    "LeaveByType",
  ];

  const lines = Array.from(rows.values()).map((r) =>
    [
      r.name || r.email,
      r.email,
      r.presentDays,
      r.halfDays,
      r.leaveDays,
      r.absentDays,
      r.netMinutes,
      r.externalBreakMinutes,
      r.overtimeMinutes,
      Object.entries(r.leaveByType)
        .map(([code, count]) => `${code}:${count}`)
        .join("|"),
    ].join(","),
  );

  const csv = [header.join(","), ...lines].join("\n");

  return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
}
