import { ensureSuperadmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { deriveUserLimit, isPlanName, PlanName } from "@/lib/plans";
import { OrgStatus, UserStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type ParamsInput = { id?: string } | Promise<{ id?: string }>;

const updateOrgSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.nativeEnum(OrgStatus).optional(),
  planName: z.string().optional(),
  defaultTimezone: z.string().optional(),
  userLimit: z.number().int().positive().nullable().optional(),
  screenshotLimit: z.number().int().positive().nullable().optional(),
  retentionDays: z.number().int().positive().nullable().optional(),
  screenshotIntervalMinutes: z.number().int().positive().nullable().optional(),
  screenshotRetentionDays: z.number().int().positive().nullable().optional(),
  screenshotMonitoredRoles: z.array(z.string()).optional(),
  screenshotPolicyLocked: z.boolean().optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

async function resolveOrgId(params: ParamsInput) {
  const resolved = params instanceof Promise ? await params : params;
  const parsed = idSchema.safeParse(resolved);
  if (!parsed.success) return null;
  return parsed.data.id;
}

async function hardDeleteOrg(orgId: string) {
  const userIds = await prisma.user.findMany({
    where: { orgId },
    select: { id: true },
  });
  const teamIds = await prisma.team.findMany({
    where: { orgId },
    select: { id: true },
  });

  const userIdList = userIds.map((u) => u.id);
  const teamIdList = teamIds.map((t) => t.id);

  const accountAndSessionDeletes =
    userIdList.length > 0
      ? [
          prisma.account.deleteMany({ where: { userId: { in: userIdList } } }),
          prisma.session.deleteMany({ where: { userId: { in: userIdList } } }),
        ]
      : [];

  const teamMemberDeletes =
    teamIdList.length > 0
      ? [prisma.teamMember.deleteMany({ where: { teamId: { in: teamIdList } } })]
      : [];

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { orgId } }),
    prisma.screenshot.deleteMany({ where: { orgId } }),
    prisma.break.deleteMany({ where: { orgId } }),
    prisma.correctionRequest.deleteMany({ where: { orgId } }),
    prisma.dailyWorkReport.deleteMany({ where: { orgId } }),
    prisma.attendance.deleteMany({ where: { orgId } }),
    prisma.leaveRequest.deleteMany({ where: { orgId } }),
    prisma.leaveBalance.deleteMany({ where: { orgId } }),
    prisma.leaveType.deleteMany({ where: { orgId } }),
    prisma.holiday.deleteMany({ where: { orgId } }),
    ...teamMemberDeletes,
    prisma.team.deleteMany({ where: { orgId } }),
    ...accountAndSessionDeletes,
    prisma.user.deleteMany({ where: { orgId } }),
    prisma.organization.delete({ where: { id: orgId } }),
  ]);
}

function buildUpdatePayload(data: z.infer<typeof updateOrgSchema>) {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.status !== undefined) payload.status = data.status;
  if (data.defaultTimezone !== undefined) payload.defaultTimezone = data.defaultTimezone;
  if (data.userLimit !== undefined) payload.userLimit = data.userLimit;
  if (data.screenshotLimit !== undefined) payload.screenshotLimit = data.screenshotLimit;
  if (data.retentionDays !== undefined) payload.retentionDays = data.retentionDays;
  if (data.screenshotIntervalMinutes !== undefined) {
    payload.screenshotIntervalMinutes = data.screenshotIntervalMinutes;
  }
  if (data.screenshotRetentionDays !== undefined) {
    payload.screenshotRetentionDays = data.screenshotRetentionDays;
  }
  if (data.screenshotMonitoredRoles !== undefined) {
    payload.screenshotMonitoredRoles = data.screenshotMonitoredRoles;
  }
  if (data.screenshotPolicyLocked !== undefined) {
    payload.screenshotPolicyLocked = data.screenshotPolicyLocked;
  }
  return payload;
}

export async function GET(_: NextRequest, { params }: { params: ParamsInput }) {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const orgId = await resolveOrgId(params);
  if (!orgId) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  return NextResponse.json({ org });
}

export async function PATCH(req: NextRequest, { params }: { params: ParamsInput }) {
  const authCheck = await ensureSuperadmin();
  if (authCheck.response) return authCheck.response;

  const orgId = await resolveOrgId(params);
  if (!orgId) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!existing) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const updates = buildUpdatePayload(parsed.data);

  const incomingPlan = parsed.data.planName?.toLowerCase();
  const effectivePlan = incomingPlan ?? (existing.planName?.toLowerCase() as string | undefined);

  if (parsed.data.planName !== undefined || parsed.data.userLimit !== undefined) {
    if (!effectivePlan || !isPlanName(effectivePlan)) {
      return NextResponse.json(
        { error: "Unsupported plan. Use starter, growth, scale, or enterprise." },
        { status: 400 },
      );
    }

    try {
      updates.planName = effectivePlan;
      updates.userLimit = deriveUserLimit(
        effectivePlan as PlanName,
        parsed.data.userLimit ?? existing.userLimit ?? undefined,
      );
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  try {
    const org = await prisma.organization.update({
      where: { id: orgId },
      data: updates,
    });
    return NextResponse.json({ org });
  } catch (err) {
    console.error(`Failed to update organisation ${orgId}`, err);
    if ((err as any)?.code === "P2025") {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const authCheck = await ensureSuperadmin();
  if (authCheck.response) return authCheck.response;

  const hardDelete = req.nextUrl.searchParams.get("hard") === "true";
  const orgId = await resolveOrgId(params);
  if (!orgId) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const existing = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!existing) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  try {
    if (hardDelete) {
      await hardDeleteOrg(orgId);
      return NextResponse.json({ orgId, hardDeleted: true });
    }

    const [org] = await prisma.$transaction([
      prisma.organization.update({
        where: { id: orgId },
        data: { status: OrgStatus.DELETED },
      }),
      prisma.user.updateMany({
        where: { orgId },
        data: { status: UserStatus.SUSPENDED },
      }),
    ]);
    return NextResponse.json({ org });
  } catch (err) {
    console.error(`Failed to delete organisation ${orgId}`, err);
    if ((err as any)?.code === "P2025") {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete organisation" }, { status: 500 });
  }
}
