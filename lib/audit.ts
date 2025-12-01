import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function logAudit(params: {
  orgId?: string | null;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: params.orgId ?? null,
        actorId: params.actorId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        before: params.before ? (params.before as Prisma.InputJsonValue) : undefined,
        after: params.after ? (params.after as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    // swallow audit failures to avoid blocking primary flow
    console.error("audit log failed", error);
  }
}
