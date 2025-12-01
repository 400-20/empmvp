import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireEmployee() {
  const session: any = await getServerSession(authOptions);
  if (
    !session?.user ||
    ![UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.ORG_ADMIN].includes(session.user.role as any) ||
    !session.user.orgId
  ) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const querySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireEmployee();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const where: Prisma.AttendanceWhereInput = { orgId: session.user.orgId, userId: session.user.id };
  const { startDate, endDate } = parsed.data;
  
  const workDateFilter: Prisma.DateTimeFilter = {};
  if (startDate) workDateFilter.gte = new Date(startDate);
  if (endDate) workDateFilter.lte = new Date(endDate);
  if (Object.keys(workDateFilter).length > 0) {
    where.workDate = workDateFilter;
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
      breaks: {
        select: {
          id: true,
          type: true,
          start: true,
          end: true,
        },
      },
    },
  });

  const enriched = records.map((r) => {
    const lunchBreakMinutes = (r.breaks ?? []).reduce((sum, b) => {
      if (b.type !== "LUNCH") return sum;
      const end = b.end ?? new Date();
      const diff = Math.max(0, (end.getTime() - b.start.getTime()) / 60000);
      return sum + Math.round(diff);
    }, 0);
    return { ...r, lunchBreakMinutes };
  });

  return NextResponse.json({ records: enriched });
}
