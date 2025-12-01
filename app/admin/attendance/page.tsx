"use client";

import { Alert, Button, Card, DatePicker, Select, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

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

export default function AdminAttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async (startDate?: string, endDate?: string, userId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/attendance?${params.toString()}`, { cache: "no-store" });
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
  }, []);

  const exportCsv = async (format: "csv" | "excel") => {
    try {
      const params = new URLSearchParams();
      if (range?.[0] && range?.[1]) {
        params.set("startDate", range[0].format("YYYY-MM-DD"));
        params.set("endDate", range[1].format("YYYY-MM-DD"));
      }
      if (userFilter) params.set("userId", userFilter);
      params.set("format", format);
      const res = await fetch(`/api/admin/attendance?${params.toString()}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error("Unable to export");
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "excel" ? "attendance.xlsx" : "attendance.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to export";
      messageApi.error(msg);
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
      { title: "External break (min)", dataIndex: "externalBreakMinutes" },
      { title: "Overtime (min)", dataIndex: "overtimeMinutes" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Attendance
      </Typography.Title>
      <Typography.Text type="secondary">Org-wide attendance view with CSV export.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <DatePicker.RangePicker
            value={range}
            onChange={(vals) => {
              setRange(vals as [Dayjs, Dayjs] | null);
              if (vals && vals[0] && vals[1]) {
                fetchData(vals[0].format("YYYY-MM-DD"), vals[1].format("YYYY-MM-DD"), userFilter);
              } else {
                fetchData(undefined, undefined, userFilter);
              }
            }}
          />
          <Select
            allowClear
            placeholder="Filter by employee (type email/name)"
            showSearch
            style={{ minWidth: 220 }}
            options={records.map((r) => ({
              value: r.user.id,
              label: r.user.name ? `${r.user.name} (${r.user.email})` : r.user.email,
            }))}
            onChange={(val) => {
              setUserFilter(val);
              fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"), val);
            }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Button onClick={() => fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"), userFilter)}>
            Refresh
          </Button>
          <Button type="primary" onClick={() => exportCsv("csv")}>
            Export CSV
          </Button>
          <Button onClick={() => exportCsv("excel")}>Export Excel</Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={records}
          loading={loading}
          pagination={{ pageSize: 12 }}
        />
      </Card>
    </div>
  );
}
