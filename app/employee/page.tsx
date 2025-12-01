"use client";

import {
  CalendarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  FieldTimeOutlined,
  Loading3QuartersOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Badge, Button, Card, Divider, Skeleton, Space, Tag, Timeline, Typography, message } from "antd";
import dayjs from "dayjs";
import { motion } from "framer-motion";
import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { ClockAttendance, ClockCard } from "@/components/clock-card";

type Attendance = {
  id: string;
  workDate?: string;
  clockIn?: string | null;
  clockOut?: string | null;
  status?: string;
  netMinutes?: number;
  externalBreakMinutes?: number;
  overtimeMinutes?: number;
  breaks?: { id: string; type: "LUNCH" | "EXTERNAL"; start: string; end?: string | null }[];
};

type ClockState = {
  loading: boolean;
  error: string | null;
  attendance: Attendance | null;
};

const actionLabels = {
  "clock-in": "Clock in",
  "clock-out": "Clock out",
  "break-in": "Start break",
  "break-out": "End break",
};

export default function EmployeeClockPage() {
  const [state, setState] = useState<ClockState>({ loading: true, error: null, attendance: null });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchToday = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/employee/attendance?startDate=${today}&endDate=${today}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load attendance");
      setState({
        loading: false,
        error: null,
        attendance: (data.records?.[0] as Attendance) ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load attendance";
      setState({ loading: false, error: msg, attendance: null });
    }
  };

  useEffect(() => {
    fetchToday();
  }, []);

  const doAction = async (
    action: "clock-in" | "clock-out" | "break-in" | "break-out",
    breakType?: "LUNCH" | "EXTERNAL",
  ) => {
    setPendingAction(action);
    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, breakType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      if (data.attendance) {
        setState({ loading: false, error: null, attendance: data.attendance });
      } else if (data.break && state.attendance) {
        const breaks = [...(state.attendance.breaks ?? [])];
        if (action === "break-in") {
          breaks.push(data.break);
        } else if (action === "break-out") {
          const idx = breaks.findIndex((b) => b.id === data.break.id);
          if (idx >= 0) breaks[idx] = data.break;
        }
        const updated: Attendance = {
          ...state.attendance,
          breaks,
        };
        setState({ loading: false, error: null, attendance: updated });
      } else {
        setState((s) => ({ ...s, loading: false }));
        fetchToday();
      }
      messageApi.success(`${actionLabels[action]} successful`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to perform action";
      setState((s) => ({ ...s, error: msg }));
      messageApi.error(msg);
    } finally {
      setPendingAction(null);
    }
  };

  const attendance = state.attendance;
  const breaks = useMemo(() => attendance?.breaks ?? [], [attendance]);
  const openLunch = useMemo(() => breaks.find((b) => b.type === "LUNCH" && !b.end), [breaks]);
  const openExternal = useMemo(() => breaks.find((b) => b.type === "EXTERNAL" && !b.end), [breaks]);

  const breakMinutes = useMemo(() => calculateBreakMinutes(attendance), [attendance]);
  const workedMinutes = useMemo(() => calculateWorkedMinutes(attendance), [attendance]);

  const stage = useMemo(() => {
    if (!attendance?.clockIn) return { label: "Not started", color: "default" as const };
    if (openLunch || openExternal) return { label: "On break", color: "orange" as const };
    if (attendance.clockIn && !attendance.clockOut) return { label: "On the clock", color: "blue" as const };
    return { label: "Completed", color: "green" as const };
  }, [attendance, openExternal, openLunch]);

  const timelineItems = useMemo(
    () =>
      buildTimeline(attendance).map((item) => ({
        color: item.color,
        dot: item.icon,
        children: (
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <Typography.Text strong>{item.title}</Typography.Text>
              <Typography.Text type="secondary">{item.subtitle}</Typography.Text>
            </div>
            <Typography.Text>{dayjs(item.time).format("HH:mm")}</Typography.Text>
          </div>
        ),
      })),
    [attendance],
  );

  return (
    <div className="space-y-6">
      {contextHolder}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-100/70 via-white to-indigo-50 p-1 shadow-xl"
      >
        <div className="rounded-[22px] bg-white/90 p-4 shadow-lg backdrop-blur">
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-3 lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    Today
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    Live clock, break capture, and quick health of your shift.
                  </Typography.Text>
                </div>
                <Tag icon={<CalendarOutlined />} color="blue">
                  {dayjs().format("dddd, MMM D")}
                </Tag>
              </div>

              {state.error ? <Alert type="error" message={state.error} /> : null}

              {state.loading ? (
                <Card className="brand-card">
                  <Skeleton active paragraph={{ rows: 4 }} />
                </Card>
              ) : (
                <ClockCard
                  attendance={attendance as ClockAttendance | null}
                  pendingAction={pendingAction}
                  onAction={doAction}
                />
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                <StatPill
                  icon={<FieldTimeOutlined />}
                  label="Worked today"
                  value={formatMinutesAsHours(workedMinutes)}
                  tone="sky"
                />
                <StatPill
                  icon={<PauseCircleOutlined />}
                  label="Break time"
                  value={formatMinutesAsHours(breakMinutes)}
                  tone="indigo"
                  footer={openLunch || openExternal ? "Break running now" : "No active break"}
                />
                <StatPill
                  icon={<ThunderboltOutlined />}
                  label="Status"
                  value={stage.label}
                  tone="emerald"
                />
              </div>
            </div>

            <Card
              className="brand-card lg:col-span-2"
              title="Shift status"
              extra={<Tag color={stage.color}>{stage.label}</Tag>}
            >
              <Space direction="vertical" size={10} className="w-full">
                <Badge
                  status={openLunch || openExternal ? "processing" : "default"}
                  text={openLunch || openExternal ? "On break" : "Not on break"}
                />
                <Divider className="my-1" />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase text-slate-500">Clocked in</div>
                    <div className="text-base font-semibold">
                      {attendance?.clockIn ? dayjs(attendance.clockIn).format("HH:mm") : "--"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase text-slate-500">Clocked out</div>
                    <div className="text-base font-semibold">
                      {attendance?.clockOut ? dayjs(attendance.clockOut).format("HH:mm") : "--"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase text-slate-500">Net minutes</div>
                    <div className="text-base font-semibold">{attendance?.netMinutes ?? workedMinutes}m</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs uppercase text-slate-500">Overtime</div>
                    <div className="text-base font-semibold">
                      {attendance?.overtimeMinutes ? `${attendance.overtimeMinutes}m` : "0m"}
                    </div>
                  </div>
                </div>
              </Space>
            </Card>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <Card
          className="brand-card lg:col-span-2"
          title="Today timeline"
          extra={<Tag icon={<ClockCircleOutlined />}>Live</Tag>}
        >
          {state.loading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : timelineItems.length ? (
            <Timeline items={timelineItems} />
          ) : (
            <EmptyState title="No events yet" description="Clock in to start your day and build your log." />
          )}
        </Card>

        <Card className="brand-card" title="Quick actions">
          <Space direction="vertical" size={12} className="w-full">
            <Link href="/employee/attendance">
              <Button block icon={<FieldTimeOutlined />} type="primary">
                View attendance history
              </Button>
            </Link>
            <Link href="/leave">
              <Button block icon={<CheckCircleFilled />} type="default">
                Request leave
              </Button>
            </Link>
            <Button block icon={<Loading3QuartersOutlined />} onClick={fetchToday}>
              Refresh today
            </Button>
          </Space>
        </Card>
      </motion.div>
    </div>
  );
}

function calculateBreakMinutes(attendance: Attendance | null) {
  const breaks = attendance?.breaks ?? [];
  return breaks.reduce((total, b) => {
    const end = b.end ?? new Date().toISOString();
    const diff = dayjs(end).diff(dayjs(b.start), "minute");
    return total + Math.max(diff, 0);
  }, 0);
}

function calculateWorkedMinutes(attendance: Attendance | null) {
  if (!attendance?.clockIn) return 0;
  const end = attendance.clockOut ?? new Date().toISOString();
  const grossMinutes = dayjs(end).diff(dayjs(attendance.clockIn), "minute");
  return Math.max(grossMinutes - calculateBreakMinutes(attendance), 0);
}

function formatMinutesAsHours(mins: number) {
  if (!mins) return "0h";
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function buildTimeline(attendance: Attendance | null) {
  if (!attendance) return [];
  const events: { time: string | Date; title: string; subtitle: string; icon: ReactNode; color: string }[] = [];
  if (attendance.clockIn) {
    events.push({
      time: attendance.clockIn,
      title: "Clocked in",
      subtitle: "Start of day",
      icon: <CheckCircleFilled style={{ color: "#10b981" }} />,
      color: "green",
    });
  }
  (attendance.breaks ?? []).forEach((b) => {
    events.push({
      time: b.start,
      title: b.type === "LUNCH" ? "Lunch started" : "External break started",
      subtitle: "Break opened",
      icon: <PauseCircleOutlined style={{ color: "#f59e0b" }} />,
      color: "orange",
    });
    if (b.end) {
      events.push({
        time: b.end,
        title: b.type === "LUNCH" ? "Lunch ended" : "External break ended",
        subtitle: "Back on the clock",
        icon: <PlayCircleOutlined style={{ color: "#0ea5e9" }} />,
        color: "blue",
      });
    }
  });
  if (attendance.clockOut) {
    events.push({
      time: attendance.clockOut,
      title: "Clocked out",
      subtitle: "End of day",
      icon: <ClockCircleOutlined style={{ color: "#6366f1" }} />,
      color: "purple",
    });
  }

  return events.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf());
}

function StatPill({
  icon,
  label,
  value,
  tone,
  footer,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "sky" | "indigo" | "emerald";
  footer?: string;
}) {
  const colors = {
    sky: "from-sky-100/80 to-white",
    indigo: "from-indigo-100/80 to-white",
    emerald: "from-emerald-100/70 to-white",
  };
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`rounded-2xl border border-slate-100 bg-gradient-to-br ${colors[tone]} p-4 shadow-sm`}
    >
      <Space align="center" size={12}>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-inner">{icon}</div>
        <div>
          <div className="text-xs uppercase text-slate-500">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
          {footer ? <div className="text-xs text-slate-500">{footer}</div> : null}
        </div>
      </Space>
    </motion.div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate-200 p-4">
      <Typography.Title level={5} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      <Typography.Text type="secondary">{description}</Typography.Text>
    </div>
  );
}
