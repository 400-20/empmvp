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
  name: z.string().min(2),
  managerId: z.string().uuid().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  managerId: z.string().uuid().nullable().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teams = await prisma.team.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      managerId: true,
      manager: { select: { id: true, name: true, email: true } },
      members: { select: { user: { select: { id: true, name: true, email: true, role: true } } } },
      createdAt: true,
    },
  });

  return NextResponse.json({
    teams: teams.map((t) => ({
      ...t,
      members: t.members.map((m) => m.user),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      orgId: session.user.orgId,
      name: parsed.data.name,
      managerId: parsed.data.managerId ?? null,
      members: parsed.data.memberIds
        ? {
            createMany: {
              data: parsed.data.memberIds.map((userId) => ({ userId })),
              skipDuplicates: true,
            },
          }
        : undefined,
    },
    select: { id: true },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "create_team",
    entity: "team",
    entityId: team.id,
    after: parsed.data,
  });

  return NextResponse.json({ team }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.team.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, orgId: true },
  });
  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.managerId !== undefined) updates.managerId = parsed.data.managerId;

  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: parsed.data.id },
      data: updates,
    });

    if (parsed.data.memberIds) {
      await tx.teamMember.deleteMany({ where: { teamId: parsed.data.id } });
      if (parsed.data.memberIds.length > 0) {
        await tx.teamMember.createMany({
          data: parsed.data.memberIds.map((userId) => ({ teamId: parsed.data.id, userId })),
          skipDuplicates: true,
        });
      }
    }
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "update_team",
    entity: "team",
    entityId: parsed.data.id,
    after: { ...updates, memberIds: parsed.data.memberIds },
  });

  return NextResponse.json({ teamId: parsed.data.id });
}

export async function DELETE(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.team.findUnique({ where: { id: parsed.data.id }, select: { orgId: true } });
  if (!existing || existing.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamId: parsed.data.id } }),
    prisma.team.delete({ where: { id: parsed.data.id } }),
  ]);

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "delete_team",
    entity: "team",
    entityId: parsed.data.id,
  });

  return NextResponse.json({ deleted: parsed.data.id });
}
