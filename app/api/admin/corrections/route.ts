import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { CorrectionStatus, Prisma, UserRole } from "@prisma/client";
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
  status: z.nativeEnum(CorrectionStatus).optional(),
});

const decideSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().optional(),
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

  const where: Prisma.CorrectionRequestWhereInput = { orgId: session.user.orgId };
  if (parsed.data.status) where.status = parsed.data.status;

  const corrections = await prisma.correctionRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      workDate: true,
      kind: true,
      status: true,
      proposedClockIn: true,
      proposedClockOut: true,
      proposedBreakStart: true,
      proposedBreakEnd: true,
      note: true,
      user: { select: { id: true, name: true, email: true, manager: { select: { name: true, email: true } } } },
      createdAt: true,
      managerId: true,
      adminId: true,
      decidedAt: true,
    },
  });

  return NextResponse.json({ corrections });
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response || !session?.user.orgId) return response;

  const body = await req.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const correction: any = await prisma.correctionRequest.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, orgId: true, status: true },
  });

  if (!correction || correction.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (![CorrectionStatus.PENDING, CorrectionStatus.MANAGER_APPROVED].includes(correction.status)) {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const status = parsed.data.action === "approve" ? CorrectionStatus.ADMIN_APPROVED : CorrectionStatus.REJECTED;

  const updated = await prisma.correctionRequest.update({
    where: { id: parsed.data.id },
    data: {
      status,
      adminId: session.user.id,
      decidedAt: new Date(),
    },
  });

  return NextResponse.json({ correction: updated });
}
