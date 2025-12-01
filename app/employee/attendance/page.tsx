"use client";

import { Alert, Card, DatePicker, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";

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
  lunchBreakMinutes?: number;
  overtimeMinutes: number;
};

export default function EmployeeAttendanceHistory() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const fetchData = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/employee/attendance?${params.toString()}`, { cache: "no-store" });
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

  const columns: ColumnsType<AttendanceRow> = [
    { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
    {
      title: "Clock in",
      dataIndex: "clockIn",
      render: (v) => (v ? dayjs(v).format("HH:mm") : "—"),
    },
    {
      title: "Clock out",
      dataIndex: "clockOut",
      render: (v) => (v ? dayjs(v).format("HH:mm") : "—"),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (v) => {
        const color =
          v === "HOLIDAY" ? "gold" : v === "PRESENT" ? "green" : v === "ABSENT" ? "red" : "blue";
        return <Tag color={color}>{v}</Tag>;
      },
    },
    { title: "Net (min)", dataIndex: "netMinutes" },
    { title: "Late (min)", dataIndex: "lateMinutes" },
    { title: "Early leave (min)", dataIndex: "earlyLeaveMinutes" },
    { title: "External break (min)", dataIndex: "externalBreakMinutes" },
    { title: "Lunch break (min)", dataIndex: "lunchBreakMinutes", render: (v) => v ?? 0 },
    { title: "Overtime (min)", dataIndex: "overtimeMinutes" },
  ];

  return (
    <div className="space-y-4">
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Attendance history
      </Typography.Title>
      <Typography.Text type="secondary">
        Review your recent attendance and break deductions.
      </Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}
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
