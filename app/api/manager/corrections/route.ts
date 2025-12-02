import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { computeAttendanceMetrics } from "@/lib/timecalc";
import { BreakType, CorrectionStatus, Prisma, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function requireManager() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.MANAGER || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

const querySchema = z.object({
  status: z.nativeEnum(CorrectionStatus).optional(),
  format: z.enum(["json", "csv"]).optional(),
});

const decideSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});

async function applyCorrectionToAttendance(correctionId: string, orgId: string) {
  try {
    const correction = await prisma.correctionRequest.findUnique({
      where: { id: correctionId },
      include: { org: true },
    });
    if (!correction || correction.orgId !== orgId) return;

    const attendance = await prisma.attendance.upsert({
      where: {
        orgId_userId_workDate: {
          orgId,
          userId: correction.userId,
          workDate: correction.workDate,
        },
      },
      create: {
        orgId,
        userId: correction.userId,
        workDate: correction.workDate,
      },
      update: {},
      include: { breaks: true },
    });

    if (correction.kind === "CLOCK") {
      await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          clockIn: correction.proposedClockIn ?? attendance.clockIn,
          clockOut: correction.proposedClockOut ?? attendance.clockOut,
        },
      });
    } else if (correction.kind === "BREAK") {
      if (!correction.proposedBreakStart && !correction.proposedBreakEnd) return;
      const targetBreak =
        attendance.breaks.find((b) => b.type === BreakType.EXTERNAL) ?? null;
      if (!targetBreak) {
        await prisma.break.create({
          data: {
            orgId,
            attendanceId: attendance.id,
            userId: correction.userId,
            type: BreakType.EXTERNAL,
            start: correction.proposedBreakStart ?? new Date(attendance.workDate),
            end: correction.proposedBreakEnd ?? null,
          },
        });
      } else {
        await prisma.break.update({
          where: { id: targetBreak.id },
          data: {
            start: correction.proposedBreakStart ?? targetBreak.start,
            end: correction.proposedBreakEnd ?? targetBreak.end,
          },
        });
      }
    }

    const refreshed = await prisma.attendance.findUnique({
      where: { id: attendance.id },
      include: { breaks: true, org: true },
    });
    if (refreshed && refreshed.org) {
      const metrics = computeAttendanceMetrics(refreshed, refreshed.org);
      await prisma.attendance.update({
        where: { id: refreshed.id },
        data: {
          netMinutes: metrics.netMinutes,
          externalBreakMinutes: metrics.externalBreakMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          lateMinutes: metrics.lateMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          status: metrics.status,
        },
      });
    }
  } catch (err) {
    console.error("applyCorrectionToAttendance failed", err);
  }
}

export async function GET(req: NextRequest) {
  const { session, response } = await requireManager();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const where: Prisma.CorrectionRequestWhereInput = {
    orgId: session.user.orgId,
    user: { managerId: session.user.id },
  };
  const { status, format } = parsed.data;
  if (status) where.status = status;

  const corrections = await prisma.correctionRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 150,
    select: {
      id: true,
      workDate: true,
      kind: true,
      status: true,
      proposedClockIn: true,
      proposedClockOut: true,
      proposedBreakStart: true,
      proposedBreakEnd: true,
      note: true,
      user: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
  });

  if (format === "csv") {
    const header = [
      "Employee",
      "Email",
      "WorkDate",
      "Kind",
      "Status",
      "ClockIn",
      "ClockOut",
      "BreakStart",
      "BreakEnd",
      "Note",
      "CreatedAt",
    ];
    const lines = corrections.map((c) =>
      [
        c.user.name || c.user.email,
        c.user.email,
        c.workDate.toISOString().slice(0, 10),
        c.kind,
        c.status,
        c.proposedClockIn ? new Date(c.proposedClockIn).toISOString() : "",
        c.proposedClockOut ? new Date(c.proposedClockOut).toISOString() : "",
        c.proposedBreakStart ? new Date(c.proposedBreakStart).toISOString() : "",
        c.proposedBreakEnd ? new Date(c.proposedBreakEnd).toISOString() : "",
        (c.note ?? "").replace(/,/g, ";"),
        c.createdAt.toISOString(),
      ].join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
  }

  return NextResponse.json({ corrections });
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireManager();
  if (response) return response;
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const correction = await prisma.correctionRequest.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      orgId: true,
      status: true,
      user: {
        select: {
          managerId: true,
          teams: { select: { team: { select: { managerId: true } } } },
        },
      },
    },
  });

  if (!correction || correction.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isDirect = correction.user.managerId === session.user.id;
  const isTeamManaged = correction.user.teams?.some((t) => t.team.managerId === session.user.id);
  if (!isDirect && !isTeamManaged) {
    return NextResponse.json({ error: "Not your team" }, { status: 403 });
  }

  if (correction.status !== CorrectionStatus.PENDING) {
    if (correction.status === CorrectionStatus.MANAGER_APPROVED && parsed.data.action === "approve") {
      // Idempotent re-apply to fix past failures (e.g., metrics recompute crash).
      await applyCorrectionToAttendance(parsed.data.id, session.user.orgId);
      return NextResponse.json({ correction: { ...correction, status: correction.status } });
    }
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const status = parsed.data.action === "approve" ? CorrectionStatus.MANAGER_APPROVED : CorrectionStatus.REJECTED;

  const updated = await prisma.correctionRequest.update({
    where: { id: parsed.data.id },
    data: {
      status,
      managerId: session.user.id,
      decidedAt: new Date(),
    },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: status === CorrectionStatus.MANAGER_APPROVED ? "manager_approve_correction" : "manager_reject_correction",
    entity: "correction_request",
    entityId: parsed.data.id,
    before: { status: correction.status },
    after: { status },
  });

  if (status === CorrectionStatus.MANAGER_APPROVED) {
    await applyCorrectionToAttendance(parsed.data.id, session.user.orgId);
  }

  return NextResponse.json({ correction: updated });
}
