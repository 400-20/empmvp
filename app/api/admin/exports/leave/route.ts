import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.ORG_ADMIN || !session.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", issues: parsed.error.flatten() }, { status: 400 });
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);

  const requests = await prisma.leaveRequest.findMany({
    where: {
      orgId: session.user.orgId,
      startDate: { lte: end },
      endDate: { gte: start },
    },
    include: { leaveType: { select: { code: true, name: true } }, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = ["Employee", "Email", "LeaveType", "StartDate", "EndDate", "HalfDay", "Status", "Reason", "CreatedAt"];
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
