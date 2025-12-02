import { authOptions } from "@/lib/auth/options";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { HrmsStatus, InviteStatus, PayrollStatus, UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { parse } from "csv-parse/sync";
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

const rowSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum([UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE]),
  managerEmail: z.string().email().optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.SUSPENDED]).optional(),
  password: z.string().min(8).optional(),
  empCode: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  doj: z.string().date().optional(),
  hrmsStatus: z.nativeEnum(HrmsStatus).optional(),
  payrollStatus: z.nativeEnum(PayrollStatus).optional(),
  inviteStatus: z.nativeEnum(InviteStatus).optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
  shiftLabel: z.string().optional(),
});

function generatePassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireOrgAdmin();
  if (response) return response;
  if (!session?.user?.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required under field `file`" }, { status: 400 });
  }

  let rows: Record<string, string>[] = [];
  try {
    const text = await file.text();
    rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    console.error("csv parse error", err);
    return NextResponse.json({ error: "Unable to read CSV. Check encoding/headers." }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "CSV is empty" }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { userLimit: true },
  });
  const activeCount = await prisma.user.count({
    where: { orgId: session.user.orgId, status: UserStatus.ACTIVE },
  });
  let remainingSlots = org?.userLimit && org.userLimit > 0 ? org.userLimit - activeCount : null;

  const lowercasedEmails = rows
    .map((r) => (typeof r.email === "string" ? r.email.toLowerCase().trim() : ""))
    .filter(Boolean);
  const existingUsers = await prisma.user.findMany({
    where: { orgId: session.user.orgId, email: { in: lowercasedEmails } },
    select: { email: true },
  });
  const existingEmailSet = new Set(existingUsers.map((u) => u.email));

  const created: Array<{
    email: string;
    name?: string | null;
    role: UserRole;
    status: UserStatus;
    managerEmail?: string | null;
    password: string;
    empCode?: string | null;
    hrmsStatus?: HrmsStatus;
    payrollStatus?: PayrollStatus;
    inviteStatus?: InviteStatus;
  }> = [];
  const failed: Array<{ row: number; email?: string; reason: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index];
    const rowNumber = index + 2; // account for header row

    const parsed = rowSchema.safeParse({
      email: raw.email?.toLowerCase().trim(),
      name: raw.name?.trim() || undefined,
      role: typeof raw.role === "string" ? raw.role.toUpperCase().trim() : undefined,
      managerEmail:
        raw.managerEmail?.toLowerCase().trim() ||
        (typeof raw["manager_email"] === "string" ? raw["manager_email"].toLowerCase().trim() : undefined),
      status: typeof raw.status === "string" ? raw.status.toUpperCase().trim() : undefined,
      password: raw.password?.trim() || undefined,
      empCode: raw.empCode?.trim() || raw["emp_code"]?.trim() || undefined,
      phone: raw.phone?.trim() || undefined,
      department: raw.department?.trim() || undefined,
      designation: raw.designation?.trim() || undefined,
      doj: raw.doj?.trim() || raw["date_of_joining"]?.trim() || undefined,
      hrmsStatus: raw.hrmsStatus?.toUpperCase().trim() || raw["hrms_status"]?.toUpperCase().trim(),
      payrollStatus: raw.payrollStatus?.toUpperCase().trim() || raw["payroll_status"]?.toUpperCase().trim(),
      inviteStatus: raw.inviteStatus?.toUpperCase().trim() || raw["invite_status"]?.toUpperCase().trim(),
      shiftStart: raw.shiftStart?.trim() || raw["shift_start"]?.trim() || undefined,
      shiftEnd: raw.shiftEnd?.trim() || raw["shift_end"]?.trim() || undefined,
      shiftLabel: raw.shiftLabel?.trim() || raw["shift_label"]?.trim() || undefined,
    });

    if (!parsed.success) {
      failed.push({ row: rowNumber, reason: "Invalid row", email: raw.email });
      continue;
    }

    const email = parsed.data.email.toLowerCase();
    if (existingEmailSet.has(email) || created.some((c) => c.email === email)) {
      failed.push({ row: rowNumber, email, reason: "Email already exists" });
      continue;
    }

    const status = parsed.data.status ?? UserStatus.ACTIVE;
    if (remainingSlots !== null && status === UserStatus.ACTIVE && remainingSlots <= 0) {
      failed.push({ row: rowNumber, email, reason: "User limit reached for this plan" });
      continue;
    }

    let managerId: string | null = null;
    let managerEmail: string | null = null;

    if (parsed.data.managerEmail) {
      const manager = await prisma.user.findFirst({
        where: {
          email: parsed.data.managerEmail,
          orgId: session.user.orgId,
          role: { in: [UserRole.MANAGER, UserRole.ORG_ADMIN] },
          status: UserStatus.ACTIVE,
        },
        select: { id: true, email: true },
      });
      if (!manager) {
        failed.push({ row: rowNumber, email, reason: "Manager email not found in this org" });
        continue;
      }
      managerId = manager.id;
      managerEmail = manager.email;
    } else if (parsed.data.role !== UserRole.ORG_ADMIN) {
      managerId = session.user.id;
      managerEmail = session.user.email ?? null;
    }

    const password = parsed.data.password ?? generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const shiftStartMinutes = timeToMinutes(parsed.data.shiftStart);
    const shiftEndMinutes = timeToMinutes(parsed.data.shiftEnd);

    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: parsed.data.name ?? null,
          role: parsed.data.role,
          status,
          orgId: session.user.orgId,
          passwordHash,
          managerId,
          empCode: parsed.data.empCode ?? null,
          phone: parsed.data.phone ?? null,
          department: parsed.data.department ?? null,
          designation: parsed.data.designation ?? null,
          doj: parsed.data.doj ? new Date(parsed.data.doj) : null,
          hrmsStatus: parsed.data.hrmsStatus ?? HrmsStatus.ACTIVE,
          payrollStatus: parsed.data.payrollStatus ?? PayrollStatus.ACTIVE,
          inviteStatus: parsed.data.inviteStatus ?? InviteStatus.INVITED,
          shiftStartMinutes,
          shiftEndMinutes,
          shiftLabel: parsed.data.shiftLabel ?? null,
        },
        select: { id: true },
      });

      created.push({
        email,
        name: parsed.data.name ?? null,
        role: parsed.data.role,
        status,
        managerEmail,
        password,
        empCode: parsed.data.empCode ?? null,
        hrmsStatus: parsed.data.hrmsStatus ?? HrmsStatus.ACTIVE,
        payrollStatus: parsed.data.payrollStatus ?? PayrollStatus.ACTIVE,
        inviteStatus: parsed.data.inviteStatus ?? InviteStatus.INVITED,
      });
      existingEmailSet.add(email);
      if (remainingSlots !== null && status === UserStatus.ACTIVE) remainingSlots -= 1;

      await logAudit({
        orgId: session.user.orgId,
        actorId: session.user.id,
        action: "import_user",
        entity: "user",
        entityId: user.id,
        after: { email, role: parsed.data.role, status, managerId },
      });
    } catch (err) {
      console.error("bulk user create error", err);
      failed.push({ row: rowNumber, email, reason: "Unable to create user" });
    }
  }

  return NextResponse.json({
    created,
    failed,
    remainingSlots,
  });
}
