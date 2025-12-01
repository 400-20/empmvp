import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireManager() {
  const session = await getServerSession(authOptions);
  if (!session?.user || ![UserRole.MANAGER, UserRole.ORG_ADMIN].includes(session.user.role as any) || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const querySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  format: z.enum(["json", "csv"]).optional(),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireManager();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const where: Prisma.AttendanceWhereInput = { orgId: session.user.orgId };
  if (session.user.role === UserRole.MANAGER) {
    where.user = { managerId: session.user.id };
  }
  const { startDate, endDate, format } = parsed.data;
  if (startDate || endDate) {
    where.workDate = {};
    if (startDate) (where.workDate as any).gte = new Date(startDate);
    if (endDate) (where.workDate as any).lte = new Date(endDate);
  }

  const records = await prisma.attendance.findMany({
    where,
    orderBy: { workDate: "desc" },
    take: 200,
    select: {
      id: true,
      workDate: true,
      clockIn: true,
      clockOut: true,
      status: true,
      netMinutes: true,
      lateMinutes: true,
      earlyLeaveMinutes: true,
      externalBreakMinutes: true,
      overtimeMinutes: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const rangeStart =
    startDate && parsed.data.startDate ? new Date(parsed.data.startDate) : records.at(-1)?.workDate;
  const rangeEnd =
    endDate && parsed.data.endDate ? new Date(parsed.data.endDate) : records.at(0)?.workDate;

  const holidays =
    rangeStart && rangeEnd
      ? await prisma.holiday.findMany({
          where: { orgId: session.user.orgId, date: { gte: rangeStart, lte: rangeEnd } },
          select: { date: true },
        })
      : [];
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  const normalizedRecords = records.map((r) => {
    const isoDate = r.workDate.toISOString().slice(0, 10);
    const status = holidaySet.has(isoDate) && r.status === "ABSENT" ? "HOLIDAY" : r.status;
    return { ...r, status };
  });

  if (format === "csv") {
    const header = [
      "Date",
      "Employee",
      "Status",
      "ClockIn",
      "ClockOut",
      "NetMinutes",
      "LateMinutes",
      "EarlyLeaveMinutes",
      "ExternalBreakMinutes",
      "OvertimeMinutes",
    ];
    const lines = normalizedRecords.map((r) => {
      const isoDate = r.workDate.toISOString().slice(0, 10);
      return [
        isoDate,
        r.user.name || r.user.email,
        r.status,
        r.clockIn ? new Date(r.clockIn).toISOString() : "",
        r.clockOut ? new Date(r.clockOut).toISOString() : "",
        r.netMinutes,
        r.lateMinutes,
        r.earlyLeaveMinutes,
        r.externalBreakMinutes,
        r.overtimeMinutes,
      ].join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: "manager_export_attendance_csv",
      entity: "attendance",
      after: { startDate, endDate, count: records.length },
    });
    return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
  }

  return NextResponse.json({ records: normalizedRecords });
}
