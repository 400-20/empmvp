import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "./options";

export async function ensureSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== UserRole.SUPERADMIN) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session, response: null };
}
