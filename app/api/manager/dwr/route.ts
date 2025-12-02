import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { DwrStatus, Prisma, UserRole } from "@prisma/client";
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
  search: z.string().max(100).optional(),
  roles: z.string().optional(), // comma separated roles
});

const noteSchema = z.object({
  id: z.string().uuid(),
  note: z.string().min(1).max(500),
});

const decideSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
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

  const rolesFilter = parsed.data.roles
    ? parsed.data.roles
        .split(",")
        .map((r) => r.trim().toUpperCase())
        .filter((r): r is UserRole => Object.values(UserRole).includes(r as UserRole))
    : [];

  const where: Prisma.DailyWorkReportWhereInput = { orgId: session.user.orgId };
  const userWhere: Prisma.UserWhereInput = {};
  if (session.user.role === UserRole.MANAGER) {
    userWhere.OR = [
      { managerId: session.user.id },
      { teams: { some: { team: { managerId: session.user.id } } } },
      { id: session.user.id },
    ];
  }
  if (rolesFilter.length) {
    userWhere.role = { in: rolesFilter };
  }
  if (parsed.data.search) {
    const term = parsed.data.search.trim();
    if (term) {
      const searchFilter: Prisma.UserWhereInput = {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ],
      };
      const existingAnd = Array.isArray(userWhere.AND) ? userWhere.AND : userWhere.AND ? [userWhere.AND] : [];
      userWhere.AND = [...existingAnd, searchFilter];
    }
  }
  if (Object.keys(userWhere).length) {
    where.user = userWhere;
  }
  const { startDate, endDate } = parsed.data;
  const workDateFilter: Prisma.DateTimeFilter = {};
  if (startDate) workDateFilter.gte = new Date(startDate);
  if (endDate) workDateFilter.lte = new Date(endDate);
  if (startDate || endDate) where.workDate = workDateFilter;

  const reports = await prisma.dailyWorkReport.findMany({
    where,
    orderBy: { workDate: "desc" },
    take: 200,
    select: {
      id: true,
      workDate: true,
      content: true,
      managerNote: true,
      status: true,
      approvedAt: true,
      approvedBy: { select: { id: true, name: true, email: true, role: true } },
      user: { select: { id: true, name: true, email: true, role: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ reports });
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireManager();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  // Accept either note update or approval action
  const parsedNote = noteSchema.safeParse(body);
  const parsedDecision = decideSchema.safeParse(body);
  if (!parsedNote.success && !parsedDecision.success) {
    return NextResponse.json({ error: "Invalid payload", issues: (parsedNote.error ?? parsedDecision.error)?.flatten?.() }, { status: 400 });
  }

  const targetId = parsedNote.success ? parsedNote.data.id : parsedDecision.success ? parsedDecision.data.id : "";

  const existing = await prisma.dailyWorkReport.findUnique({
    where: { id: targetId },
    select: {
      orgId: true,
      status: true,
      user: {
        select: {
          role: true,
          managerId: true,
          teams: { select: { team: { select: { managerId: true } } } },
        },
      },
    },
  });

  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.user.role === UserRole.MANAGER) {
    const isDirect = existing.user.managerId === session.user.id;
    const isTeamManaged = existing.user.teams?.some((t) => t.team.managerId === session.user.id);
    if (!isDirect && !isTeamManaged) {
      return NextResponse.json({ error: "Not your team" }, { status: 403 });
    }
    if (existing.user.role === UserRole.MANAGER) {
      return NextResponse.json({ error: "Only org admins can act on manager DWRs" }, { status: 403 });
    }
  }

  if (parsedDecision.success) {
    const status = parsedDecision.data.action === "approve" ? DwrStatus.APPROVED : DwrStatus.REJECTED;
    const report = await prisma.dailyWorkReport.update({
      where: { id: parsedDecision.data.id },
      data: {
        status,
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });
    return NextResponse.json({ report });
  }

  if (!parsedNote.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const report = await prisma.dailyWorkReport.update({
    where: { id: parsedNote.data.id },
    data: { managerNote: parsedNote.data.note },
  });

  return NextResponse.json({ report });
}
