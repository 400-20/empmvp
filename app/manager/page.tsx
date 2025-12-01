"use client";

import { Alert, Card, DatePicker, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { ClockCard, ClockAttendance } from "@/components/clock-card";

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
  user: { id: string; name?: string | null; email: string };
};

type SelfAttendance = {
  id: string;
  workDate: string;
  clockIn?: string | null;
  clockOut?: string | null;
  status: string;
  breaks?: { id: string; type: "LUNCH" | "EXTERNAL"; start: string; end?: string | null }[];
};

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
};

export default function ManagerAttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [self, setSelf] = useState<SelfAttendance | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

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

  useEffect(() => {
    fetchData();
    fetchSelf();
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to perform action";
      setError(msg);
      messageApi.error(msg);
    } finally {
      setPendingAction(null);
    }
  };

  const columns: ColumnsType<AttendanceRow> = [
    { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
    { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email },
    { title: "Status", dataIndex: "status", render: (v) => <Tag>{v}</Tag> },
    { title: "Clock in", dataIndex: "clockIn", render: (v) => (v ? dayjs(v).format("HH:mm") : "—") },
    { title: "Clock out", dataIndex: "clockOut", render: (v) => (v ? dayjs(v).format("HH:mm") : "—") },
    { title: "Net (min)", dataIndex: "netMinutes" },
    { title: "Late (min)", dataIndex: "lateMinutes" },
    { title: "Early leave (min)", dataIndex: "earlyLeaveMinutes" },
    { title: "External break (min)", dataIndex: "externalBreakMinutes" },
    { title: "Overtime (min)", dataIndex: "overtimeMinutes" },
  ];

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Team attendance
      </Typography.Title>
      <Typography.Text type="secondary">Your team&apos;s recent attendance records.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="brand-card" loading={!metrics}>
          <Typography.Text type="secondary">Team size</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {metrics?.teamSize ?? 0}
          </Typography.Title>
        </Card>
        <Card className="brand-card" loading={!metrics}>
          <Typography.Text type="secondary">Pending leave</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {metrics?.pendingLeave ?? 0}
          </Typography.Title>
        </Card>
        <Card className="brand-card" loading={!metrics}>
          <Typography.Text type="secondary">Pending corrections</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {metrics?.pendingCorrections ?? 0}
          </Typography.Title>
        </Card>
        <Card className="brand-card" loading={!metrics}>
          <Typography.Text type="secondary">Today present</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {metrics?.attendanceToday.present ?? 0}
          </Typography.Title>
          <div className="text-xs text-slate-600">
            Half {metrics?.attendanceToday.half ?? 0} | Leave {metrics?.attendanceToday.leave ?? 0} | Absent {metrics?.attendanceToday.absent ?? 0}
          </div>
        </Card>
      </div>

      <ClockCard
        attendance={self as ClockAttendance | null}
        pendingAction={pendingAction}
        onAction={(action, breakType) => doAction(action, breakType)}
        title="Your shift"
      />

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
    </div>
  );
}
