import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireOrgAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.ORG_ADMIN || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const querySchema = z.object({
  userId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  format: z.enum(["json", "csv", "excel"]).optional(),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, startDate, endDate, format } = parsed.data;
  const where: Prisma.AttendanceWhereInput = { orgId: session.user.orgId };
  if (userId) where.userId = userId;
  if (startDate) where.workDate = { ...(typeof where.workDate === "object" && where.workDate !== null ? where.workDate : {}), gte: new Date(startDate) };
  if (endDate) where.workDate = { ...(typeof where.workDate === "object" && where.workDate !== null ? where.workDate : {}), lte: new Date(endDate) };

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
      user: { select: { id: true, name: true, email: true, managerId: true } },
    },
  });

  const rangeStart =
    startDate && parsed.data.startDate ? new Date(parsed.data.startDate) : records.at(-1)?.workDate;
  const rangeEnd =
    endDate && parsed.data.endDate ? new Date(parsed.data.endDate) : records.at(0)?.workDate;

  const holidayDates =
    rangeStart && rangeEnd
      ? await prisma.holiday.findMany({
          where: {
            orgId: session.user.orgId,
            date: {
              gte: rangeStart,
              lte: rangeEnd,
            },
          },
          select: { date: true },
        })
      : [];
  const holidaySet = new Set(holidayDates.map((h) => h.date.toISOString().slice(0, 10)));

  const normalizedRecords = records.map((r) => {
    const isoDate = r.workDate.toISOString().slice(0, 10);
    const status = holidaySet.has(isoDate) && r.status === "ABSENT" ? "HOLIDAY" : r.status;
    return { ...r, status };
  });

  if (format === "csv" || format === "excel") {
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
      "IsHoliday",
    ];
    const lines = normalizedRecords.map((r) => {
      const isoDate = r.workDate.toISOString().slice(0, 10);
      const isHoliday = holidaySet.has(isoDate);
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
        isHoliday ? "Yes" : "No",
      ].join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");

    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: format === "excel" ? "export_attendance_excel" : "export_attendance_csv",
      entity: "attendance",
      after: { startDate, endDate, userId, count: records.length },
    });
    const headers = new Headers();
    if (format === "excel") {
      headers.set("Content-Type", "application/vnd.ms-excel");
      headers.set("Content-Disposition", 'attachment; filename="attendance.xlsx"');
    } else {
      headers.set("Content-Type", "text/csv");
    }
    return new NextResponse(csv, {
      status: 200,
      headers,
    });
  }

  return NextResponse.json({ records: normalizedRecords });
}
