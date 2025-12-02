import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { UserRole, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireEmployee() {
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    ![UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.ORG_ADMIN].includes(session.user.role as any) ||
    !session.user.orgId
  ) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const createSchema = z.object({
  workDate: z.string().date(),
  content: z.string().min(3).max(2000),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireEmployee();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const startDate = params["startDate"];
  const endDate = params["endDate"];

  const where: Prisma.DailyWorkReportWhereInput = { orgId: session.user.orgId, userId: session.user.id };
  const dateFilter: Prisma.DateTimeFilter = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);
  if (startDate || endDate) where.workDate = dateFilter;

  const reports = await prisma.dailyWorkReport.findMany({
    where,
    orderBy: { workDate: "desc" },
    take: 60,
    select: {
      id: true,
      workDate: true,
      content: true,
      managerNote: true,
      status: true,
      approvedAt: true,
      approvedBy: { select: { id: true, name: true, email: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireEmployee();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  // limit to today and last 2 days
  const workDate = new Date(parsed.data.workDate);
  const today = new Date();
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(today.getDate() - 2);
  if (workDate > today || workDate < threeDaysAgo) {
    return NextResponse.json({ error: "DWR allowed only for today and last 2 days" }, { status: 400 });
  }

  const report = await prisma.dailyWorkReport.upsert({
    where: { orgId_userId_workDate: { orgId: session.user.orgId, userId: session.user.id, workDate } },
    update: { content: parsed.data.content },
    create: {
      orgId: session.user.orgId,
      userId: session.user.id,
      workDate,
      content: parsed.data.content,
    },
  });

  return NextResponse.json({ report });
}
