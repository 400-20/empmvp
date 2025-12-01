import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.orgId || session.user.role !== "ORG_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { screenshotRetentionDays: true },
  });

  const retentionDays = org?.screenshotRetentionDays ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const deleted = await prisma.screenshot.deleteMany({
    where: { orgId: session.user.orgId, capturedAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: deleted.count, cutoff });
}
