import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { HrmsStatus, InviteStatus, PayrollStatus, UserRole, UserStatus } from "@prisma/client";
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
  empCode: z.string().min(1).optional(),
  phone: z.string().min(5).max(20).optional(),
  department: z.string().min(2).optional(),
  designation: z.string().min(2).optional(),
  doj: z.string().date().optional(),
  hrmsStatus: z.nativeEnum(HrmsStatus).optional(),
  payrollStatus: z.nativeEnum(PayrollStatus).optional(),
  inviteStatus: z.nativeEnum(InviteStatus).optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
  shiftLabel: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  role: z.nativeEnum(UserRole).refine((r) => r !== UserRole.SUPERADMIN, "Not allowed").optional(),
  status: z.nativeEnum(UserStatus).optional(),
  managerId: z.string().uuid().optional().nullable(),
  password: z.string().min(8).optional(),
  empCode: z.string().min(1).optional().nullable(),
  phone: z.string().min(5).max(20).optional().nullable(),
  department: z.string().min(2).optional().nullable(),
  designation: z.string().min(2).optional().nullable(),
  doj: z.string().date().optional().nullable(),
  hrmsStatus: z.nativeEnum(HrmsStatus).optional(),
  payrollStatus: z.nativeEnum(PayrollStatus).optional(),
  inviteStatus: z.nativeEnum(InviteStatus).optional(),
  shiftStart: z.string().optional().nullable(),
  shiftEnd: z.string().optional().nullable(),
  shiftLabel: z.string().optional().nullable(),
});

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

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
      empCode: true,
      phone: true,
      department: true,
      designation: true,
      doj: true,
      hrmsStatus: true,
      payrollStatus: true,
      inviteStatus: true,
      shiftStartMinutes: true,
      shiftEndMinutes: true,
      shiftLabel: true,
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
  let managerId: string | null = parsed.data.managerId ?? null;
  const shiftStartMinutes = timeToMinutes(parsed.data.shiftStart ?? undefined);
  const shiftEndMinutes = timeToMinutes(parsed.data.shiftEnd ?? undefined);

  if (managerId) {
    const manager = await prisma.user.findFirst({
      where: {
        id: managerId,
        orgId: session.user.orgId,
        role: { in: [UserRole.MANAGER, UserRole.ORG_ADMIN] },
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!manager) {
      return NextResponse.json({ error: "Manager must belong to this org and be active" }, { status: 400 });
    }
  } else if (parsed.data.role !== UserRole.ORG_ADMIN) {
    // Default to the creating org admin as manager if none provided
    managerId = session.user.id;
  }

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
        managerId,
        empCode: parsed.data.empCode ?? null,
        phone: parsed.data.phone ?? null,
        department: parsed.data.department ?? null,
        designation: parsed.data.designation ?? null,
        doj: parsed.data.doj ? new Date(parsed.data.doj) : null,
        hrmsStatus: parsed.data.hrmsStatus ?? HrmsStatus.ACTIVE,
        payrollStatus: parsed.data.payrollStatus ?? PayrollStatus.ACTIVE,
        inviteStatus: parsed.data.inviteStatus ?? InviteStatus.INVITED,
        shiftStartMinutes,
        shiftEndMinutes,
        shiftLabel: parsed.data.shiftLabel ?? null,
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
        empCode: parsed.data.empCode,
        department: parsed.data.department,
        hrmsStatus: parsed.data.hrmsStatus ?? HrmsStatus.ACTIVE,
        payrollStatus: parsed.data.payrollStatus ?? PayrollStatus.ACTIVE,
        inviteStatus: parsed.data.inviteStatus ?? InviteStatus.INVITED,
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
  if (parsed.data.empCode !== undefined) data.empCode = parsed.data.empCode;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
  if (parsed.data.department !== undefined) data.department = parsed.data.department;
  if (parsed.data.designation !== undefined) data.designation = parsed.data.designation;
  if (parsed.data.doj !== undefined) data.doj = parsed.data.doj ? new Date(parsed.data.doj) : null;
  if (parsed.data.hrmsStatus !== undefined) data.hrmsStatus = parsed.data.hrmsStatus;
  if (parsed.data.payrollStatus !== undefined) data.payrollStatus = parsed.data.payrollStatus;
  if (parsed.data.inviteStatus !== undefined) data.inviteStatus = parsed.data.inviteStatus;
  if (parsed.data.shiftStart !== undefined) data.shiftStartMinutes = timeToMinutes(parsed.data.shiftStart);
  if (parsed.data.shiftEnd !== undefined) data.shiftEndMinutes = timeToMinutes(parsed.data.shiftEnd);
  if (parsed.data.shiftLabel !== undefined) data.shiftLabel = parsed.data.shiftLabel;
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
