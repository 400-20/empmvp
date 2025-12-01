import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { CorrectionKind, CorrectionStatus, UserRole } from "@prisma/client";
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

const createSchema = z
  .object({
    workDate: z.string().date(),
    kind: z.nativeEnum(CorrectionKind),
    proposedClockIn: z.string().datetime().optional(),
    proposedClockOut: z.string().datetime().optional(),
    proposedBreakStart: z.string().datetime().optional(),
    proposedBreakEnd: z.string().datetime().optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.kind === CorrectionKind.CLOCK) {
        return data.proposedClockIn || data.proposedClockOut;
      }
      return data.proposedBreakStart || data.proposedBreakEnd;
    },
    { message: "Provide at least one corrected time" },
  );

export async function GET() {
  const { session, response } = await requireEmployee();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const corrections = await prisma.correctionRequest.findMany({
    where: { orgId: session.user.orgId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
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
      managerId: true,
      adminId: true,
      decidedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ corrections });
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

  const data = parsed.data;
  const correction = await prisma.correctionRequest.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      workDate: new Date(data.workDate),
      kind: data.kind,
      proposedClockIn: data.proposedClockIn ? new Date(data.proposedClockIn) : null,
      proposedClockOut: data.proposedClockOut ? new Date(data.proposedClockOut) : null,
      proposedBreakStart: data.proposedBreakStart ? new Date(data.proposedBreakStart) : null,
      proposedBreakEnd: data.proposedBreakEnd ? new Date(data.proposedBreakEnd) : null,
      note: data.note ?? null,
      status: CorrectionStatus.PENDING,
    },
  });

  return NextResponse.json({ correction }, { status: 201 });
}
