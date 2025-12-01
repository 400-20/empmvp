import { ensureSuperadmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { OrgStatus, UserRole, UserStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});

type ParamsPromise = { params: Promise<{ id?: string }> };

export async function POST(req: NextRequest, { params }: ParamsPromise) {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing org id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org || org.status === OrgStatus.DELETED) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: parsed.data.name ?? null,
        passwordHash,
        role: UserRole.ORG_ADMIN,
        status: UserStatus.ACTIVE,
        orgId: org.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        orgId: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create org admin (maybe duplicate email?)" }, { status: 400 });
  }
}

type ParamsPromiseReadable = { params: { id: string } | Promise<{ id?: string }> };

export async function GET(req: NextRequest, { params }: ParamsPromiseReadable) {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const paramsResolved = await params;
  const id = (paramsResolved as { id?: string }).id;
  if (!id) return NextResponse.json({ error: "Missing org id" }, { status: 400 });

  const admins = await prisma.user.findMany({
    where: { orgId: id, role: UserRole.ORG_ADMIN },
    select: { id: true, email: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ admins });
}

const resetSchema = z.object({
  action: z.literal("reset-password"),
  password: z.string().min(8),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  adminId: z.string().uuid(),
});

export async function PATCH(req: NextRequest, { params }: ParamsPromiseReadable) {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const paramsResolved = await params;
  const id = (paramsResolved as { id?: string }).id;
  if (!id) return NextResponse.json({ error: "Missing org id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const updated = await prisma.user.updateMany({
    where: { orgId: id, role: UserRole.ORG_ADMIN, status: UserStatus.ACTIVE },
    data: { passwordHash },
  });

  await logAudit({
    orgId: id,
    actorId: null,
    action: "reset_org_admin_passwords",
    entity: "user",
    entityId: undefined,
    after: { updated: updated.count },
  });

  return NextResponse.json({ updated: updated.count });
}

export async function DELETE(req: NextRequest, { params }: ParamsPromiseReadable) {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const paramsResolved = await params;
  const id = (paramsResolved as { id?: string }).id;
  if (!id) return NextResponse.json({ error: "Missing org id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = await prisma.user.findUnique({
    where: { id: parsed.data.adminId },
    select: { id: true, orgId: true, role: true },
  });

  if (!admin || admin.orgId !== id || admin.role !== UserRole.ORG_ADMIN) {
    return NextResponse.json({ error: "Org admin not found" }, { status: 404 });
  }

  const activeCount = await prisma.user.count({
    where: { orgId: id, role: UserRole.ORG_ADMIN, status: UserStatus.ACTIVE, id: { not: admin.id } },
  });

  if (activeCount === 0) {
    return NextResponse.json({ error: "At least one org admin must remain" }, { status: 400 });
  }

  const deleted = await prisma.user.delete({ where: { id: admin.id } });

  await logAudit({
    orgId: id,
    actorId: null,
    action: "delete_org_admin",
    entity: "user",
    entityId: admin.id,
    before: { id: admin.id },
    after: null,
  });

  return NextResponse.json({ deleted: deleted.id });
}
