import { ensureSuperadmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { deriveUserLimit, isPlanName, PlanName } from "@/lib/plans";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z.string().min(2),
  planName: z.string().transform((value) => value.toLowerCase()),
  defaultTimezone: z.string().optional(),
  userLimit: z.number().int().positive().optional(),
  screenshotLimit: z.number().int().positive().optional(),
  retentionDays: z.number().int().positive().optional(),
  screenshotIntervalMinutes: z.number().int().positive().optional(),
  screenshotRetentionDays: z.number().int().positive().optional(),
  screenshotMonitoredRoles: z.array(z.string()).optional(),
  screenshotPolicyLocked: z.boolean().optional(),
});

export async function GET() {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ orgs });
}

export async function POST(req: NextRequest) {
  const authCheck = await ensureSuperadmin();
  if (authCheck.response) return authCheck.response;

  const body = await req.json().catch(() => null);
  const parsed = createOrgSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!isPlanName(parsed.data.planName)) {
    return NextResponse.json({ error: "Unsupported plan" }, { status: 400 });
  }

  let userLimit: number;
  try {
    userLimit = deriveUserLimit(parsed.data.planName as PlanName, parsed.data.userLimit);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const org = await prisma.organization.create({
      data: {
        name: parsed.data.name,
        planName: parsed.data.planName,
        userLimit,
        defaultTimezone: parsed.data.defaultTimezone,
        screenshotLimit: parsed.data.screenshotLimit,
        retentionDays: parsed.data.retentionDays,
        screenshotIntervalMinutes: parsed.data.screenshotIntervalMinutes,
        screenshotRetentionDays: parsed.data.screenshotRetentionDays,
        screenshotMonitoredRoles: parsed.data.screenshotMonitoredRoles ?? [],
        screenshotPolicyLocked: parsed.data.screenshotPolicyLocked ?? false,
      },
    });

    return NextResponse.json({ org }, { status: 201 });
  } catch (err) {
    console.error("Failed to create organisation", err);
    return NextResponse.json({ error: "Failed to create organisation" }, { status: 500 });
  }
}
