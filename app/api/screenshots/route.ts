import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  capturedAt: z.string().datetime(),
  attendanceId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const page = Number(params.page ?? 1);
  const pageSize = Math.min(Number(params.pageSize ?? 20), 100);

  const where: Prisma.ScreenshotWhereInput = {
    orgId: session.user.orgId,
  };

  if (session.user.role === UserRole.EMPLOYEE) {
    where.userId = session.user.id;
  } else if (session.user.role === UserRole.MANAGER) {
    where.user = { managerId: session.user.id };
  }

  const screenshots = await prisma.screenshot.findMany({
    where,
    orderBy: { capturedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      userId: true,
      user: { select: { name: true, email: true } },
      attendanceId: true,
      capturedAt: true,
      url: true,
      thumbnailUrl: true,
      isFlagged: true,
    },
  });

  return NextResponse.json({ screenshots });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.screenshot.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      attendanceId: parsed.data.attendanceId ?? null,
      capturedAt: new Date(parsed.data.capturedAt),
      url: parsed.data.url,
      thumbnailUrl: parsed.data.thumbnailUrl ?? null,
    },
    select: {
      id: true,
      url: true,
      thumbnailUrl: true,
      capturedAt: true,
    },
  });

  return NextResponse.json({ screenshot: created }, { status: 201 });
}
