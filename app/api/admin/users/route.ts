import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "@prisma/client";
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
  email: z.string().email(),
  name: z.string().min(2).optional(),
  role: z.nativeEnum(UserRole).refine((r) => r !== UserRole.SUPERADMIN, "Not allowed"),
  password: z.string().min(8),
  managerId: z.string().uuid().optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  role: z.nativeEnum(UserRole).refine((r) => r !== UserRole.SUPERADMIN, "Not allowed").optional(),
  status: z.nativeEnum(UserStatus).optional(),
  managerId: z.string().uuid().optional().nullable(),
  password: z.string().min(8).optional(),
});

export async function GET() {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { orgId: session.user.orgId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      managerId: true,
      manager: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
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

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { userLimit: true },
  });

  if (org?.userLimit && org.userLimit > 0) {
    const activeCount = await prisma.user.count({
      where: { orgId: session.user.orgId, status: UserStatus.ACTIVE },
    });
    if (activeCount >= org.userLimit) {
      return NextResponse.json({ error: "User limit reached for this plan" }, { status: 400 });
    }
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name ?? null,
        role: parsed.data.role,
        status: UserStatus.ACTIVE,
        orgId: session.user.orgId,
        passwordHash,
        managerId: parsed.data.managerId ?? null,
      },
      select: { id: true },
    });

    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: "create_user",
      entity: "user",
      entityId: user.id,
      after: {
        email: parsed.data.email,
        role: parsed.data.role,
        status: UserStatus.ACTIVE,
        managerId: parsed.data.managerId,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create user (duplicate email?)" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
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

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.managerId !== undefined) data.managerId = parsed.data.managerId;
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: parsed.data.id, orgId: session.user.orgId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (
      parsed.data.status === UserStatus.ACTIVE &&
      existing.status !== UserStatus.ACTIVE
    ) {
      const org = await prisma.organization.findUnique({
        where: { id: session.user.orgId },
        select: { userLimit: true },
      });
      if (org?.userLimit && org.userLimit > 0) {
        const activeCount = await prisma.user.count({
          where: {
            orgId: session.user.orgId,
            status: UserStatus.ACTIVE,
            id: { not: parsed.data.id },
          },
        });
        if (activeCount >= org.userLimit) {
          return NextResponse.json({ error: "User limit reached for this plan" }, { status: 400 });
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: parsed.data.id, orgId: session.user.orgId },
      data,
      select: { id: true },
    });

    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: "update_user",
      entity: "user",
      entityId: user.id,
      after: data,
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Unable to update user" }, { status: 400 });
  }
}
