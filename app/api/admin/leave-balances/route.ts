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

const upsertSchema = z.object({
  userId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.number().int(),
  balance: z.number().int().min(0),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const userId = params["userId"];

  const where: Prisma.LeaveBalanceWhereInput = { orgId: session.user.orgId };
  if (userId) where.userId = userId;

  const balances = await prisma.leaveBalance.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      leaveTypeId: true,
      year: true,
      balance: true,
      used: true,
      user: { select: { id: true, name: true, email: true } },
      leaveType: { select: { id: true, code: true, name: true } },
    },
  });

  return NextResponse.json({ balances });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const balance = await prisma.leaveBalance.upsert({
    where: {
      orgId_userId_leaveTypeId_year: {
        orgId: session.user.orgId,
        userId: parsed.data.userId,
        leaveTypeId: parsed.data.leaveTypeId,
        year: parsed.data.year,
      },
    },
    create: {
      orgId: session.user.orgId,
      userId: parsed.data.userId,
      leaveTypeId: parsed.data.leaveTypeId,
      year: parsed.data.year,
      balance: parsed.data.balance,
    },
    update: {
      balance: parsed.data.balance,
    },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "upsert_leave_balance",
    entity: "leave_balance",
    entityId: balance.id,
    after: balance,
  });

  return NextResponse.json({ balance });
}
