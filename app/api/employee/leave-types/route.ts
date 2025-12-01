import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

async function requireEmployeeContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.orgId) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // employees and managers fetch their org leave types; org admins can also use this endpoint if needed
  if (![UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.ORG_ADMIN].includes(session.user.role as any)) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: undefined as NextResponse | undefined };
}

export async function GET() {
  const { session, response } = await requireEmployeeContext();
  if (response) return response;
  if (!session?.user.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const types = await prisma.leaveType.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ types });
}
