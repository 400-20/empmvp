import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { LeaveRequestStatus, Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.ORG_ADMIN || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const querySchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  status: z.nativeEnum(LeaveRequestStatus).optional(),
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

  return existing.reduce((sum, req) => sum + leaveDays(req.startDate, req.endDate, req.isHalfDay), 0);
}

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  if (!session?.user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const where: Prisma.LeaveRequestWhereInput = { orgId: session.user.orgId };
  const { startDate, endDate, status } = parsed.data;
  if (startDate) where.startDate = { gte: new Date(startDate) };
  if (endDate) where.endDate = { lte: new Date(endDate) };
  if (status) where.status = status;

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 400,
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
      user: { select: { id: true, name: true, email: true, manager: { select: { name: true, email: true } } } },
      leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
    },
  });

  return NextResponse.json({ requests });
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  if (!session?.user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const request = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.id },
    select: {
      orgId: true,
      status: true,
      userId: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      leaveTypeId: true,
      user: { select: { managerId: true } },
    },
  });

  if (!request || request.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.status !== LeaveRequestStatus.PENDING) {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const status = parsed.data.action === "approve" ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED;

  if (status === LeaveRequestStatus.APPROVED && request.leaveTypeId) {
    const year = request.startDate.getUTCFullYear();
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: request.leaveTypeId },
      select: { defaultAnnualQuota: true, orgId: true },
    });
    if (!leaveType || leaveType.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
    }

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        orgId_userId_leaveTypeId_year: {
          orgId: session.user.orgId,
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      },
      select: { balance: true, used: true },
    });

    const limit = balance?.balance ?? leaveType.defaultAnnualQuota;
    if (limit !== null && limit !== undefined) {
      const approvedDays = await sumExistingLeaveDays({
        orgId: session.user.orgId,
        userId: request.userId,
        leaveTypeId: request.leaveTypeId,
        year,
        statuses: [LeaveRequestStatus.APPROVED],
        excludeRequestId: parsed.data.id,
      });
      const currentDays = leaveDays(request.startDate, request.endDate, request.isHalfDay);
      if (approvedDays + currentDays > limit) {
        return NextResponse.json(
          { error: `Quota exceeded. Available: ${Math.max(0, limit - approvedDays)} day(s).` },
          { status: 400 },
        );
      }

      await prisma.leaveBalance.upsert({
        where: {
          orgId_userId_leaveTypeId_year: {
            orgId: session.user.orgId,
            userId: request.userId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        update: { used: approvedDays + currentDays },
        create: {
          orgId: session.user.orgId,
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
          year,
          balance: limit,
          used: approvedDays + currentDays,
        },
      });
    }
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: parsed.data.id },
    data: { status, adminId: session.user.id, decidedAt: new Date() },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: status === LeaveRequestStatus.APPROVED ? "approve_leave_request" : "reject_leave_request",
    entity: "leave_request",
    entityId: parsed.data.id,
    before: { status: request.status },
    after: { status },
  });

  return NextResponse.json({ request: updated });
}
