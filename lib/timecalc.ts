import { AttendanceStatus, BreakType, Organization } from "@prisma/client";

type AttendanceLike = {
  clockIn: Date | null;
  clockOut: Date | null;
  breaks: { type: BreakType; start: Date; end: Date | null }[];
};

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function computeAttendanceMetrics(att: AttendanceLike, org: Organization) {
  const requiredDailyMinutes = org.requiredDailyMinutes ?? 480;
  const halfDayThreshold = org.halfDayThresholdMinutes ?? Math.floor(requiredDailyMinutes / 2);
  const workdayStartMinutes = org.workdayStartMinutes ?? 540; // 09:00
  const workdayEndMinutes = org.workdayEndMinutes ?? 1080; // 18:00
  const graceLateMinutes = org.graceLateMinutes ?? 0;
  const graceEarlyMinutes = org.graceEarlyMinutes ?? 0;

  const breakMinutes = (att.breaks ?? []).reduce((total, b) => {
    if (!b.start) return total;
    const end = b.end ?? new Date();
    return total + minutesBetween(b.start, end);
  }, 0);

  const externalBreakMinutes = (att.breaks ?? []).reduce((total, b) => {
    if (b.type !== BreakType.EXTERNAL) return total;
    const end = b.end ?? new Date();
    return total + minutesBetween(b.start, end);
  }, 0);

  let netMinutes = 0;
  let overtimeMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let status: AttendanceStatus = AttendanceStatus.ABSENT;

  if (att.clockIn) {
    const end = att.clockOut ?? new Date();
    const gross = minutesBetween(att.clockIn, end);
    netMinutes = Math.max(0, gross - breakMinutes);

    // lateness
    const clockInMinutes = minuteOfDay(att.clockIn);
    const lateRaw = clockInMinutes - workdayStartMinutes - graceLateMinutes;
    lateMinutes = Math.max(0, lateRaw);

    if (att.clockOut) {
      const clockOutMinutes = minuteOfDay(att.clockOut);
      const earlyRaw = workdayEndMinutes - clockOutMinutes - graceEarlyMinutes;
      earlyLeaveMinutes = Math.max(0, earlyRaw);
    }

    overtimeMinutes = Math.max(0, netMinutes - requiredDailyMinutes);

    if (!att.clockOut) {
      status = AttendanceStatus.PRESENT;
    } else if (netMinutes >= requiredDailyMinutes) {
      status = AttendanceStatus.PRESENT;
    } else if (netMinutes >= halfDayThreshold) {
      status = AttendanceStatus.HALF;
    } else {
      status = AttendanceStatus.ABSENT;
    }
  }

  return { netMinutes, externalBreakMinutes, overtimeMinutes, lateMinutes, earlyLeaveMinutes, status };
}
