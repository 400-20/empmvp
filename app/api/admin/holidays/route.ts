import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { OrgStatus, UserRole } from "@prisma/client";
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
  date: z.string().date(),
  label: z.string().min(2),
  isFullDay: z.boolean().default(true),
});

export async function GET() {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const holidays = await prisma.holiday.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { date: "asc" },
    select: { id: true, date: true, label: true, isFullDay: true },
  });

  return NextResponse.json({ holidays });
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

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { status: true } });
  if (!org || org.status === OrgStatus.DELETED) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const holiday = await prisma.holiday.create({
    data: {
      orgId: session.user.orgId,
      date: new Date(parsed.data.date),
      label: parsed.data.label,
      isFullDay: parsed.data.isFullDay,
    },
    select: { id: true, date: true, label: true, isFullDay: true },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: "create_holiday",
    entity: "holiday",
    entityId: holiday.id,
    after: holiday,
  });

  return NextResponse.json({ holiday }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing holiday id" }, { status: 400 });
  }

  try {
    const deleted = await prisma.holiday.delete({ where: { id, orgId: session.user.orgId } });

    await logAudit({
      orgId: session.user.orgId,
      actorId: session.user.id,
      action: "delete_holiday",
      entity: "holiday",
      entityId: id,
      before: deleted,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete holiday" }, { status: 400 });
  }
}
