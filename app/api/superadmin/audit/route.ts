import { ensureSuperadmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const { response } = await ensureSuperadmin();
  if (response) return response;

  const orgId = req.nextUrl.searchParams.get("orgId") || undefined;
  const format = req.nextUrl.searchParams.get("format") || "json";

  const logs = await prisma.auditLog.findMany({
    where: orgId ? { orgId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      orgId: true,
      action: true,
      entity: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { id: true, email: true, name: true } },
    },
  });

  if (format === "csv") {
    const header = [
      "id",
      "orgId",
      "action",
      "entity",
      "entityId",
      "actorId",
      "actorEmail",
      "actorName",
      "createdAt",
      "before",
      "after",
    ];
    const lines = logs.map((l) =>
      [
        l.id,
        l.orgId ?? "",
        l.action,
        l.entity,
        l.entityId ?? "",
        l.actor?.id ?? "",
        l.actor?.email ?? "",
        l.actor?.name ?? "",
        l.createdAt.toISOString(),
        l.before ? JSON.stringify(l.before) : "",
        l.after ? JSON.stringify(l.after) : "",
      ]
        .map((v) => {
          const str = `${v}`;
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-${orgId ?? "all"}.csv"`,
      },
    });
  }

  return NextResponse.json({ logs });
}
