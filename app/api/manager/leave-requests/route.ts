import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { LeaveRequestStatus, Prisma, UserRole } from "@prisma/client";
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
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  format: z.enum(["json", "csv"]).optional(),
});

const decideSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});

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

  const where: Prisma.LeaveRequestWhereInput = {
    orgId: session.user.orgId,
    user: {
      OR: [
        { managerId: session.user.id },
        { teams: { some: { team: { managerId: session.user.id } } } },
      ],
    },
  };
  const { startDate, endDate, format } = parsed.data;
  if (startDate || endDate) {
    where.startDate = {};
    if (startDate) (where.startDate as any).gte = new Date(startDate);
    if (endDate) (where.startDate as any).lte = new Date(endDate);
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      status: true,
      reason: true,
      managerId: true,
      adminId: true,
      decidedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
    },
  });

  if (format === "csv") {
    const header = [
      "Employee",
      "Email",
      "LeaveType",
      "StartDate",
      "EndDate",
      "HalfDay",
      "Status",
      "Reason",
      "CreatedAt",
    ];
    const lines = requests.map((r) =>
      [
        r.user.name || r.user.email,
        r.user.email,
        `${r.leaveType.code} (${r.leaveType.name})`,
        r.startDate.toISOString().slice(0, 10),
        r.endDate.toISOString().slice(0, 10),
        r.isHalfDay ? "Yes" : "No",
        r.status,
        r.reason?.replace(/,/g, ";") ?? "",
        r.createdAt.toISOString(),
      ].join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
  }

  return NextResponse.json({ requests });
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

  const request = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.id },
    select: { orgId: true, status: true, user: { select: { managerId: true } } },
  });

  if (!request || request.orgId !== session.user.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.user.managerId !== session.user.id) {
    return NextResponse.json({ error: "Not allowed for this team" }, { status: 403 });
  }

  if (request.status !== LeaveRequestStatus.PENDING) {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const status = parsed.data.action === "approve" ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED;

  const updated = await prisma.leaveRequest.update({
    where: { id: parsed.data.id },
    data: { status, managerId: session.user.id, decidedAt: new Date() },
  });

  await logAudit({
    orgId: session.user.orgId,
    actorId: session.user.id,
    action: status === LeaveRequestStatus.APPROVED ? "manager_approve_leave_request" : "manager_reject_leave_request",
    entity: "leave_request",
    entityId: parsed.data.id,
    before: { status: request.status },
    after: { status },
  });

  return NextResponse.json({ request: updated });
}
