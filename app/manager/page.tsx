"use client";

import { Alert, Button, Card, DatePicker, Drawer, Space, Table, Tag, Tooltip, Typography, message, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ClockCard, ClockAttendance } from "@/components/clock-card";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
} from "recharts";
import { motion } from "framer-motion";

type AttendanceRow = {
  id: string;
  workDate: string;
  clockIn?: string | null;
  clockOut?: string | null;
  status: string;
  netMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  externalBreakMinutes: number;
  overtimeMinutes: number;
  breakSummary?: {
    externalMinutes: number;
    lunchMinutes: number;
    activeType: "LUNCH" | "EXTERNAL" | null;
  };
  breaks?: { id: string; type: "LUNCH" | "EXTERNAL"; start: string; end?: string | null; deductedMinutes: number }[];
  user: { id: string; name?: string | null; email: string };
};

type SelfAttendance = AttendanceRow;

type Metrics = {
  teamSize: number;
  pendingLeave: number;
  pendingCorrections: number;
  attendanceToday: {
    present: number;
    half: number;
    leave: number;
    absent: number;
    holiday: number;
  };
  last30Days?: {
    windowDays: number;
    avgNetMinutes: number;
    lateDays: number;
    earlyLeaveDays: number;
    presentDays: number;
    halfDays: number;
    leaveDays: number;
    absentDays: number;
    holidayDays: number;
  };
};

export default function ManagerAttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [selfRecords, setSelfRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [selfRange, setSelfRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [self, setSelf] = useState<SelfAttendance | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [breakDrawerOpen, setBreakDrawerOpen] = useState(false);
  const [selectedBreaks, setSelectedBreaks] = useState<{ date: string; user: string; breaks: NonNullable<AttendanceRow["breaks"]> }>({
    date: "",
    user: "",
    breaks: [],
  });

  const attendancePieData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: "Present", value: metrics.attendanceToday.present, fill: "#10b981" },
      { name: "Half", value: metrics.attendanceToday.half, fill: "#f59e0b" },
      { name: "Leave", value: metrics.attendanceToday.leave, fill: "#6366f1" },
      { name: "Absent", value: metrics.attendanceToday.absent, fill: "#ef4444" },
      { name: "Holiday", value: metrics.attendanceToday.holiday, fill: "#0ea5e9" },
    ].filter((d) => d.value > 0);
  }, [metrics]);

  const last30BarData = useMemo(() => {
    if (!metrics?.last30Days) return [];
    return [
      { name: "Present", count: metrics.last30Days.presentDays, fill: "#10b981" },
      { name: "Half", count: metrics.last30Days.halfDays, fill: "#f59e0b" },
      { name: "Leave", count: metrics.last30Days.leaveDays, fill: "#6366f1" },
      { name: "Absent", count: metrics.last30Days.absentDays, fill: "#ef4444" },
      { name: "Holiday", count: metrics.last30Days.holidayDays, fill: "#0ea5e9" },
    ];
  }, [metrics]);

  const fetchData = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/manager/attendance?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load attendance");
      setRecords(data.records ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load attendance";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchSelfRecords = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/employee/attendance?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load your attendance");
      const mapped: AttendanceRow[] = (data.records ?? []).map((r: any) => ({
        ...r,
        user: { id: "self", name: "You", email: "" },
        breakSummary: undefined,
      }));
      setSelfRecords(mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load your attendance";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSelf();
    fetchSelfRecords();
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/manager/dashboard", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load metrics");
      setMetrics(data.metrics ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load metrics";
      setError(msg);
    }
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (range?.[0] && range?.[1]) {
        params.set("startDate", range[0].format("YYYY-MM-DD"));
        params.set("endDate", range[1].format("YYYY-MM-DD"));
      }
      params.set("format", "csv");
      const res = await fetch(`/api/manager/attendance?${params.toString()}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error("Unable to export");
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "attendance-team.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to export";
      messageApi.error(msg);
    }
  };

  const fetchSelf = async () => {
    try {
      const today = dayjs().format("YYYY-MM-DD");
      const res = await fetch(`/api/employee/attendance?startDate=${today}&endDate=${today}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load your attendance");
      setSelf(data.records?.[0] ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load your attendance";
      setError(msg);
    }
  };

  const doAction = async (action: "clock-in" | "clock-out" | "break-in" | "break-out", breakType?: "LUNCH" | "EXTERNAL") => {
    setPendingAction(action);
    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, breakType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      messageApi.success(`${action === "clock-in" ? "Clocked in" : "Clocked out"}`);
      setSelf(data.attendance ?? null);
      fetchSelfRecords(selfRange?.[0]?.format("YYYY-MM-DD"), selfRange?.[1]?.format("YYYY-MM-DD"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to perform action";
      setError(msg);
      messageApi.error(msg);
    } finally {
      setPendingAction(null);
    }
  };

  const columns: ColumnsType<AttendanceRow> = useMemo(
    () => [
      { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
      { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email },
      {
        title: "Status",
        dataIndex: "status",
        render: (v) => {
          const color =
            v === "HOLIDAY" ? "gold" : v === "PRESENT" ? "green" : v === "ABSENT" ? "red" : "blue";
          return <Tag color={color}>{v}</Tag>;
        },
      },
      { title: "Clock in", dataIndex: "clockIn", render: (v) => (v ? dayjs(v).format("HH:mm") : "—") },
      { title: "Clock out", dataIndex: "clockOut", render: (v) => (v ? dayjs(v).format("HH:mm") : "—") },
      { title: "Net (min)", dataIndex: "netMinutes" },
      { title: "Late (min)", dataIndex: "lateMinutes" },
      { title: "Early leave (min)", dataIndex: "earlyLeaveMinutes" },
      {
        title: "Breaks",
        dataIndex: "breakSummary",
        render: (_v, r) => {
          const lunch = r.breakSummary?.lunchMinutes ?? 0;
          const external = r.breakSummary?.externalMinutes ?? r.externalBreakMinutes ?? 0;
          const active = r.breakSummary?.activeType;
          return (
            <Space direction="vertical" size={0}>
              <span>Lunch: {Math.round(lunch)}m</span>
              <span>External: {Math.round(external)}m</span>
              {active ? (
                <Tag color="blue" style={{ width: "fit-content" }}>
                  On {active.toLowerCase()} break
                </Tag>
              ) : null}
              {r.breaks && r.breaks.length ? (
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setSelectedBreaks({
                      date: r.workDate,
                      user: r.user.name || r.user.email,
                      breaks: r.breaks!,
                    });
                    setBreakDrawerOpen(true);
                  }}
                >
                  View details
                </Button>
              ) : null}
            </Space>
          );
        },
      },
      { title: "Overtime (min)", dataIndex: "overtimeMinutes" },
    ],
    [],
  );

  return (
    <div className="!space-y-4">
      {contextHolder}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-3xl border border-slate-100 bg-gradient-to-br from-sky-100/70 via-white to-indigo-50 p-1 shadow-xl"
      >
        <div className="rounded-[22px] bg-white/90 p-4 shadow-lg backdrop-blur space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Typography.Title level={3} style={{ marginBottom: 0 }}>
                Team attendance
              </Typography.Title>
              <Typography.Text type="secondary">Your team&apos;s recent attendance records.</Typography.Text>
            </div>
            <Button onClick={() => { fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD")); fetchMetrics(); fetchSelf(); fetchSelfRecords(selfRange?.[0]?.format("YYYY-MM-DD"), selfRange?.[1]?.format("YYYY-MM-DD")); }}>
              Refresh
            </Button>
          </div>
          {error ? <Alert type="error" message={error} /> : null}

          <ClockCard
            attendance={self as ClockAttendance | null}
            pendingAction={pendingAction}
            onAction={(action, breakType) => doAction(action, breakType)}
            title="Your shift"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <MetricCard
              title="Team size"
              tooltip="Active team members assigned to you."
              value={metrics?.teamSize ?? 0}
              loading={!metrics}
            />
            <MetricCard
              title="Pending leave"
              tooltip="Leave requests from your team awaiting your decision."
              value={metrics?.pendingLeave ?? 0}
              loading={!metrics}
            />
            <MetricCard
              title="Pending corrections"
              tooltip="Timing correction requests needing your approval."
              value={metrics?.pendingCorrections ?? 0}
              loading={!metrics}
            />
            <MetricCard
              title="Today present"
              tooltip="Headcount present today with quick breakdown."
              value={metrics?.attendanceToday.present ?? 0}
              loading={!metrics}
              extra={
                <div className="text-xs text-slate-600">
                  Half {metrics?.attendanceToday.half ?? 0} | Leave {metrics?.attendanceToday.leave ?? 0} | Absent{" "}
                  {metrics?.attendanceToday.absent ?? 0} | Holiday {metrics?.attendanceToday.holiday ?? 0}
                </div>
              }
            />

            <MetricCard
              title="Late / Early days (30d)"
              tooltip="Count of days with late arrivals or early leaves in the last 30 days."
              value={
                metrics?.last30Days
                  ? `${metrics.last30Days.lateDays} late • ${metrics.last30Days.earlyLeaveDays} early`
                  : "--"
              }
              loading={!metrics}
            />
            <MetricCard
              title="Status mix (30d)"
              tooltip="Distribution of Present, Half-day, Leave, Absent, and Holiday days for the team over the last month."
              value={
                metrics?.last30Days
                  ? `P ${metrics.last30Days.presentDays ?? 0} | H ${metrics.last30Days.halfDays ?? 0} | L ${metrics.last30Days.leaveDays ?? 0} | A ${metrics.last30Days.absentDays ?? 0} | Hol ${metrics.last30Days.holidayDays ?? 0}`
                  : "--"
              }
              loading={!metrics}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="brand-card" title="Today mix" loading={!metrics}>
              {attendancePieData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={attendancePieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>
                      {attendancePieData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Typography.Text type="secondary">No attendance recorded today.</Typography.Text>
              )}
            </Card>
            <Card className="brand-card" title="Last 30 days status" loading={!metrics}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={last30BarData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <RechartTooltip />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {last30BarData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      </motion.div>

      <Tabs
        defaultActiveKey="team"
        items={[
          {
            key: "team",
            label: "Team attendance",
            children: (
              <Card>
                <div className="mb-4">
                  <DatePicker.RangePicker
                    value={range}
                    onChange={(vals) => {
                      setRange(vals as [Dayjs, Dayjs] | null);
                      if (vals && vals[0] && vals[1]) {
                        fetchData(vals[0].format("YYYY-MM-DD"), vals[1].format("YYYY-MM-DD"));
                      } else {
                        fetchData();
                      }
                    }}
                  />
                  <div className="mt-2">
                    <Typography.Link onClick={exportCsv}>Export CSV</Typography.Link>
                  </div>
                </div>
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={records}
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          {
            key: "self",
            label: "My attendance",
            children: (
              <Card>
                <div className="mb-4">
                  <DatePicker.RangePicker
                    value={selfRange}
                    onChange={(vals) => {
                      setSelfRange(vals as [Dayjs, Dayjs] | null);
                      if (vals && vals[0] && vals[1]) {
                        fetchSelfRecords(vals[0].format("YYYY-MM-DD"), vals[1].format("YYYY-MM-DD"));
                      } else {
                        fetchSelfRecords();
                      }
                    }}
                  />
                </div>
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={selfRecords}
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        title={`Break details${selectedBreaks.user ? ` – ${selectedBreaks.user}` : ""}`}
        open={breakDrawerOpen}
        onClose={() => setBreakDrawerOpen(false)}
        width={420}
      >
        <Typography.Paragraph type="secondary">
          {selectedBreaks.date ? dayjs(selectedBreaks.date).format("YYYY-MM-DD") : ""}
        </Typography.Paragraph>
        {selectedBreaks.breaks && selectedBreaks.breaks.length ? (
          <div className="space-y-3">
            {selectedBreaks.breaks.map((b) => {
              const start = dayjs(b.start).format("HH:mm");
              const end = b.end ? dayjs(b.end).format("HH:mm") : "In progress";
              const duration = b.end ? Math.max(0, Math.round((dayjs(b.end).valueOf() - dayjs(b.start).valueOf()) / 60000)) : null;
              return (
                <Card key={b.id} size="small">
                  <Space direction="vertical" size={2}>
                    <Typography.Text strong>{b.type === "LUNCH" ? "Lunch break" : "External break"}</Typography.Text>
                    <Typography.Text>
                      {start} → {end}
                      {duration !== null ? ` • ${duration}m` : ""}
                    </Typography.Text>
                    {b.deductedMinutes ? (
                      <Typography.Text type="secondary">{b.deductedMinutes}m deducted</Typography.Text>
                    ) : null}
                  </Space>
                </Card>
              );
            })}
          </div>
        ) : (
          <Typography.Text type="secondary">No break details for this day.</Typography.Text>
        )}
      </Drawer>
    </div>
  );
}

function MetricCard({
  title,
  value,
  tooltip,
  loading,
  extra,
}: {
  title: string;
  value: string | number;
  tooltip: string;
  loading: boolean;
  extra?: ReactNode;
}) {
  return (
    <Card className="brand-card" loading={loading}>
      <Tooltip title={tooltip}>
        <Typography.Text type="secondary">{title}</Typography.Text>
      </Tooltip>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {value}
      </Typography.Title>
      {extra}
    </Card>
  );
}
