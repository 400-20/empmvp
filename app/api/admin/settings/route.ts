import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { OrgStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const settingsSchema = z.object({
  timezone: z.string().min(2),
  workdayStartMinutes: z.number().int().min(0).max(1440),
  workdayEndMinutes: z.number().int().min(0).max(1440),
  requiredDailyMinutes: z.number().int().min(0).max(1440),
  halfDayThresholdMinutes: z.number().int().min(0).max(1440).optional(),
  paidLunchMinutes: z.number().int().min(0).max(240).optional(),
  lunchWindowStartMinutes: z.number().int().min(0).max(1440).optional(),
  lunchWindowEndMinutes: z.number().int().min(0).max(1440).optional(),
  allowExternalBreaks: z.boolean().optional(),
  graceLateMinutes: z.number().int().min(0).max(120).optional(),
  graceEarlyMinutes: z.number().int().min(0).max(120).optional(),
  screenshotIntervalMinutes: z.number().int().min(1).max(120).optional(),
  screenshotRetentionDays: z.number().int().min(1).max(365).optional(),
  screenshotMonitoredRoles: z.array(z.string()).optional(),
});

async function requireOrgAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.ORG_ADMIN || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

export async function GET() {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: {
      id: true,
      defaultTimezone: true,
      workdayStartMinutes: true,
      workdayEndMinutes: true,
      requiredDailyMinutes: true,
      halfDayThresholdMinutes: true,
      paidLunchMinutes: true,
      lunchWindowStartMinutes: true,
      lunchWindowEndMinutes: true,
      allowExternalBreaks: true,
      graceLateMinutes: true,
      graceEarlyMinutes: true,
      screenshotIntervalMinutes: true,
      screenshotRetentionDays: true,
      screenshotMonitoredRoles: true,
      screenshotPolicyLocked: true,
      status: true,
    },
  });

  if (!org || org.status === OrgStatus.DELETED) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  return NextResponse.json({ org });
}

export async function PUT(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: {
      screenshotPolicyLocked: true,
      screenshotIntervalMinutes: true,
      screenshotRetentionDays: true,
    },
  });

  if (
    org?.screenshotPolicyLocked &&
    ((parsed.data.screenshotIntervalMinutes !== undefined &&
      parsed.data.screenshotIntervalMinutes !== org.screenshotIntervalMinutes) ||
      (parsed.data.screenshotRetentionDays !== undefined &&
        parsed.data.screenshotRetentionDays !== org.screenshotRetentionDays))
  ) {
    return NextResponse.json(
      { error: "Screenshot interval/retention are locked by superadmin." },
      { status: 403 },
    );
  }

  const data: Record<string, unknown> = {
    defaultTimezone: parsed.data.timezone,
    workdayStartMinutes: parsed.data.workdayStartMinutes,
    workdayEndMinutes: parsed.data.workdayEndMinutes,
    requiredDailyMinutes: parsed.data.requiredDailyMinutes,
    halfDayThresholdMinutes: parsed.data.halfDayThresholdMinutes,
    paidLunchMinutes: parsed.data.paidLunchMinutes,
    lunchWindowStartMinutes: parsed.data.lunchWindowStartMinutes,
    lunchWindowEndMinutes: parsed.data.lunchWindowEndMinutes,
    allowExternalBreaks: parsed.data.allowExternalBreaks,
    graceLateMinutes: parsed.data.graceLateMinutes,
    graceEarlyMinutes: parsed.data.graceEarlyMinutes,
    screenshotMonitoredRoles: parsed.data.screenshotMonitoredRoles ?? [],
  };

  if (!org?.screenshotPolicyLocked) {
    data.screenshotIntervalMinutes = parsed.data.screenshotIntervalMinutes;
    data.screenshotRetentionDays = parsed.data.screenshotRetentionDays;
  }

  const updated = await prisma.organization.update({
    where: { id: session.user.orgId },
    data,
    select: { id: true },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "update_settings",
    entity: "organization",
    entityId: session.user.orgId,
    after: parsed.data,
  });

  return NextResponse.json({ updated: updated.id });
}
