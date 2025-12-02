import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { AttendanceStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  format: z.enum(["csv", "json", "excel"]).default("csv").optional(),
});

function dayCount(start: Date, end: Date) {
  const startUtc = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const endUtc = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
  return Math.max(1, Math.floor((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

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
  const format = parsed.data.format ?? "csv";

  const holidayDates = await prisma.holiday.findMany({
    where: { orgId: session.user.orgId, date: { gte: start, lte: end } },
    select: { date: true },
  });
  const holidaySet = new Set(holidayDates.map((h) => h.date.toISOString().slice(0, 10)));

  const attendances = await prisma.attendance.findMany({
    where: { orgId: session.user.orgId, workDate: { gte: start, lte: end } },
    include: { user: { select: { id: true, name: true, email: true, ctcMonthly: true } } },
  });

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      orgId: session.user.orgId,
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    include: { leaveType: { select: { code: true, isPaid: true } }, user: { select: { id: true, name: true, email: true, ctcMonthly: true } } },
  });

  type Row = {
    userId: string;
    name: string;
    email: string;
    presentDays: number;
    halfDays: number;
    leaveDays: number;
    absentDays: number;
    holidayDays: number;
    netMinutes: number;
    externalBreakMinutes: number;
    overtimeMinutes: number;
    leaveByType: Record<string, number>;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    ctcMonthly?: string | null;
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
        holidayDays: 0,
        netMinutes: 0,
        externalBreakMinutes: 0,
      overtimeMinutes: 0,
      leaveByType: {},
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      ctcMonthly: a.user.ctcMonthly?.toString(),
    });
  }
    const row = rows.get(a.userId)!;
    row.netMinutes += a.netMinutes ?? 0;
    row.externalBreakMinutes += a.externalBreakMinutes ?? 0;
    row.overtimeMinutes += a.overtimeMinutes ?? 0;
    const isoDate = a.workDate.toISOString().slice(0, 10);
    const status =
      holidaySet.has(isoDate) && a.status === AttendanceStatus.ABSENT ? AttendanceStatus.HOLIDAY : a.status;
    if (status === AttendanceStatus.PRESENT) row.presentDays += 1;
    if (status === AttendanceStatus.HALF) row.halfDays += 1;
    if (status === AttendanceStatus.LEAVE) row.leaveDays += 1;
    if (status === AttendanceStatus.ABSENT) row.absentDays += 1;
    if (status === AttendanceStatus.HOLIDAY) row.holidayDays += 1;
  });

  leaveRequests.forEach((lr) => {
    if (!rows.has(lr.userId)) {
      rows.set(lr.userId, {
        userId: lr.userId,
        name: lr.user.name ?? "",
        email: lr.user.email,
        presentDays: 0,
        halfDays: 0,
        leaveDays: 0,
        absentDays: 0,
        holidayDays: 0,
        netMinutes: 0,
        externalBreakMinutes: 0,
        overtimeMinutes: 0,
        leaveByType: {},
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        ctcMonthly: lr.user.ctcMonthly?.toString(),
      });
    }
    const row = rows.get(lr.userId)!;
    const code = lr.leaveType.code;
    const days = dayCount(
      new Date(Math.max(start.getTime(), lr.startDate.getTime())),
      new Date(Math.min(end.getTime(), lr.endDate.getTime())),
    );
    row.leaveByType[code] = (row.leaveByType[code] ?? 0) + days;
    if (lr.leaveType.isPaid) {
      row.paidLeaveDays += days;
    } else {
      row.unpaidLeaveDays += days;
    }
  });

  const workingDays = dayCount(start, end);

  if (format === "json") {
    return NextResponse.json({ rows: Array.from(rows.values()) });
  }

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
    "HolidayDays",
    "LeaveByType",
    "PaidLeaveDays",
    "UnpaidLeaveDays",
    "PayableDays",
    "PayableAmount",
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
      r.holidayDays,
      Object.entries(r.leaveByType)
        .map(([code, count]) => `${code}:${count}`)
        .join("|"),
      r.paidLeaveDays,
      r.unpaidLeaveDays,
      r.presentDays + r.paidLeaveDays + r.halfDays * 0.5,
      (() => {
        const monthly = r.ctcMonthly ? Number(r.ctcMonthly) : 0;
        if (!monthly || workingDays <= 0) return 0;
        const perDay = monthly / workingDays;
        const payableDays = r.presentDays + r.paidLeaveDays + r.halfDays * 0.5;
        return Math.max(0, Number((perDay * payableDays).toFixed(2)));
      })(),
    ].join(","),
  );

  const csv = [header.join(","), ...lines].join("\n");
  const headers = new Headers();
  if (format === "excel") {
    headers.set("Content-Type", "application/vnd.ms-excel");
    headers.set("Content-Disposition", 'attachment; filename="payroll.xlsx"');
  } else {
    headers.set("Content-Type", "text/csv");
  }

  return new NextResponse(csv, { status: 200, headers });
}
