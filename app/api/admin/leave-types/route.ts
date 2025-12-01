import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { UserRole } from "@prisma/client";
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

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  isPaid: z.boolean().default(true),
  defaultAnnualQuota: z.number().int().min(0).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  isPaid: z.boolean().optional(),
  defaultAnnualQuota: z.number().int().min(0).nullable().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const types = await prisma.leaveType.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ types });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.leaveType.create({
    data: {
      orgId: session.user.orgId,
      code: parsed.data.code,
      name: parsed.data.name,
      isPaid: parsed.data.isPaid,
      defaultAnnualQuota: parsed.data.defaultAnnualQuota ?? null,
    },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "create_leave_type",
    entity: "leave_type",
    entityId: created.id,
    after: created,
  });

  return NextResponse.json({ type: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.leaveType.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  try {
    const updated = await prisma.leaveType.update({
      where: { id: parsed.data.id },
      data: {
        code: parsed.data.code ?? undefined,
        name: parsed.data.name ?? undefined,
        isPaid: parsed.data.isPaid ?? undefined,
        defaultAnnualQuota:
          parsed.data.defaultAnnualQuota === undefined ? undefined : parsed.data.defaultAnnualQuota,
      },
    });

    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: "update_leave_type",
      entity: "leave_type",
      entityId: updated.id,
      before: existing,
      after: updated,
    });

    return NextResponse.json({ type: updated });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Code already exists for this organisation" }, { status: 409 });
    }
    console.error("Failed to update leave type", err);
    return NextResponse.json({ error: "Failed to update leave type" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.leaveType.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
  }

  try {
    const [requestsCount, balancesCount] = await Promise.all([
      prisma.leaveRequest.count({ where: { leaveTypeId: parsed.data.id } }),
      prisma.leaveBalance.count({ where: { leaveTypeId: parsed.data.id } }),
    ]);

    if (requestsCount > 0 || balancesCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete: leave type is in use by requests or balances." },
        { status: 409 },
      );
    }

    await prisma.leaveType.delete({ where: { id: parsed.data.id } });
    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: "delete_leave_type",
      entity: "leave_type",
      entityId: parsed.data.id,
      before: existing,
    });
    return NextResponse.json({ deleted: parsed.data.id });
  } catch (err) {
    console.error("Failed to delete leave type", err);
    return NextResponse.json({ error: "Failed to delete leave type" }, { status: 500 });
  }
}
