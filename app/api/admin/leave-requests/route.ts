import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
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

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const request = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.id },
    select: { orgId: true, status: true },
  });
  if (!request || request.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.status !== LeaveRequestStatus.PENDING) {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const status = parsed.data.action === "approve" ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED;
  const updated = await prisma.leaveRequest.update({
    where: { id: parsed.data.id },
    data: { status, adminId: session.user.id, decidedAt: new Date() },
  });

  return NextResponse.json({ request: updated });
}
