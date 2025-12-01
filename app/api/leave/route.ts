import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { LeaveRequestStatus, Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const createSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  isHalfDay: z.boolean().optional(),
  reason: z.string().optional(),
});

const decideSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});

function leaveDays(start: Date, end: Date, isHalfDay?: boolean | null) {
  const startUtc = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const endUtc = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
  const diffDays = Math.floor((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24));
  const base = Math.max(1, diffDays + 1);
  return isHalfDay ? 0.5 : base;
}

async function sumExistingLeaveDays(params: {
  orgId: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  statuses?: LeaveRequestStatus[];
  excludeRequestId?: string;
}) {
  const startOfYear = new Date(Date.UTC(params.year, 0, 1));
  const endOfYear = new Date(Date.UTC(params.year, 11, 31, 23, 59, 59, 999));
  const existing = await prisma.leaveRequest.findMany({
    where: {
      orgId: params.orgId,
      userId: params.userId,
      leaveTypeId: params.leaveTypeId,
      status: { in: params.statuses ?? [LeaveRequestStatus.APPROVED, LeaveRequestStatus.PENDING] },
      id: params.excludeRequestId ? { not: params.excludeRequestId } : undefined,
      startDate: { lte: endOfYear },
      endDate: { gte: startOfYear },
    },
    select: { id: true, startDate: true, endDate: true, isHalfDay: true },
  });

  return existing.reduce((sum, req) => {
    const days = leaveDays(req.startDate, req.endDate, req.isHalfDay);
    return sum + days;
  }, 0);
}

export async function GET() {
  const { session, response } = await requireUser();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where: Prisma.LeaveRequestWhereInput = { orgId: session.user.orgId };
  if (session.user.role === UserRole.EMPLOYEE || session.user.role === UserRole.MANAGER) {
    where.userId = session.user.id;
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      status: true,
      reason: true,
      managerId: true,
      adminId: true,
      decidedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
    },
  });

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireUser();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  const leaveType = await prisma.leaveType.findUnique({
    where: { id: parsed.data.leaveTypeId },
    select: { id: true, orgId: true, defaultAnnualQuota: true },
  });
  if (!leaveType || leaveType.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  const requestDays = leaveDays(start, end, parsed.data.isHalfDay);
  if (requestDays <= 0) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const year = start.getUTCFullYear();
  const balance = await prisma.leaveBalance.findUnique({
    where: {
      orgId_userId_leaveTypeId_year: {
        orgId: session.user.orgId,
        userId: session.user.id,
        leaveTypeId: parsed.data.leaveTypeId,
        year,
      },
    },
    select: { balance: true, used: true },
  });

  const limit = balance?.balance ?? leaveType.defaultAnnualQuota;
  if (limit !== null && limit !== undefined) {
    const alreadyUsed = await sumExistingLeaveDays({
      orgId: session.user.orgId,
      userId: session.user.id,
      leaveTypeId: parsed.data.leaveTypeId,
      year,
    });
    if (alreadyUsed + requestDays > limit) {
      return NextResponse.json(
        { error: `Quota exceeded. Available: ${Math.max(0, limit - alreadyUsed)} day(s).` },
        { status: 400 },
      );
    }
  }

  const created = await prisma.leaveRequest.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      leaveTypeId: parsed.data.leaveTypeId,
      startDate: start,
      endDate: end,
      isHalfDay: parsed.data.isHalfDay ?? false,
      status: LeaveRequestStatus.PENDING,
      reason: parsed.data.reason ?? null,
    },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "create_leave_request",
    entity: "leave_request",
    entityId: created.id,
    after: created,
  });

  return NextResponse.json({ request: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireUser();
  if (response || !session?.user.orgId) return response;

  const body = await req.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const request = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.id },
    select: { orgId: true, userId: true, status: true, startDate: true, endDate: true, isHalfDay: true, leaveTypeId: true },
  });
  if (!request || request.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // manager can approve/reject only if they are assigned? For now allow org admin; manager placeholder
  const isAdmin = session.user.role === UserRole.ORG_ADMIN;
  const isManager = session.user.role === UserRole.MANAGER;
  if (!isAdmin && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = parsed.data.action === "approve" ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED;

  if (status === LeaveRequestStatus.APPROVED && request.leaveTypeId) {
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: request.leaveTypeId },
      select: { defaultAnnualQuota: true, orgId: true },
    });
    if (!leaveType || leaveType.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
    }
    if (leaveType.defaultAnnualQuota !== null && leaveType.defaultAnnualQuota !== undefined) {
      const year = request.startDate.getUTCFullYear();
      const alreadyUsed = await sumExistingLeaveDays({
        orgId: session.user.orgId,
        userId: request.userId,
        leaveTypeId: request.leaveTypeId,
        year,
        excludeRequestId: parsed.data.id,
      });
      const currentDays = leaveDays(request.startDate, request.endDate, request.isHalfDay);
      if (alreadyUsed + currentDays > leaveType.defaultAnnualQuota) {
        return NextResponse.json(
          { error: `Quota exceeded. Available: ${Math.max(0, leaveType.defaultAnnualQuota - alreadyUsed)} day(s).` },
          { status: 400 },
        );
      }
    }
  }
  const updateData: Prisma.LeaveRequestUpdateInput = {
    status,
    decidedAt: new Date(),
  };
  if (isAdmin) updateData.admin = { connect: { id: session.user.id } };
  if (isManager) updateData.manager = { connect: { id: session.user.id } };

  const updated = await prisma.leaveRequest.update({
    where: { id: parsed.data.id },
    data: updateData,
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: `${parsed.data.action}_leave_request`,
    entity: "leave_request",
    entityId: parsed.data.id,
    after: updated,
  });

  return NextResponse.json({ request: updated });
}
