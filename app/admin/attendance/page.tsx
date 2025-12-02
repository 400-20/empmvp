"use client";

import { Alert, Button, Card, DatePicker, Drawer, Input, Select, Space, Table, Tag, Typography, message } from "antd";
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
  breakSummary?: {
    externalMinutes: number;
    lunchMinutes: number;
    activeType: "LUNCH" | "EXTERNAL" | null;
  };
  breaks?: { id: string; type: "LUNCH" | "EXTERNAL"; start: string; end?: string | null; deductedMinutes: number }[];
  user: {
    id: string;
    name?: string | null;
    email: string;
    department?: string | null;
    hrmsStatus?: string | null;
    payrollStatus?: string | null;
    empCode?: string | null;
  };
};

export default function AdminAttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [userFilter, setUserFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>(undefined);
  const [hrmsFilter, setHrmsFilter] = useState<string | undefined>(undefined);
  const [payrollFilter, setPayrollFilter] = useState<string | undefined>(undefined);
  const [yearFilter, setYearFilter] = useState<string | undefined>(undefined);
  const [monthFilter, setMonthFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [messageApi, contextHolder] = message.useMessage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<AttendanceRow | null>(null);

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
                    setSelected(r);
                    setDrawerOpen(true);
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

  const departments = useMemo(
    () => Array.from(new Set(records.map((r) => r.user.department).filter(Boolean))) as string[],
    [records],
  );
  const hrmsStatuses = useMemo(
    () => Array.from(new Set(records.map((r) => (r as any).user.hrmsStatus).filter(Boolean))) as string[],
    [records],
  );
  const payrollStatuses = useMemo(
    () => Array.from(new Set(records.map((r) => (r as any).user.payrollStatus).filter(Boolean))) as string[],
    [records],
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const term = search.toLowerCase().trim();
      const date = dayjs(r.workDate);
      if (yearFilter && date.year().toString() !== yearFilter) return false;
      if (monthFilter && date.format("MM") !== monthFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (departmentFilter && r.user.department !== departmentFilter) return false;
      if (hrmsFilter && (r as any).user.hrmsStatus !== hrmsFilter) return false;
      if (payrollFilter && (r as any).user.payrollStatus !== payrollFilter) return false;
      if (term) {
        const hay = `${r.user.name ?? ""} ${r.user.email} ${(r as any).user.empCode ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [departmentFilter, hrmsFilter, monthFilter, payrollFilter, records, search, statusFilter, yearFilter]);

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Attendance
      </Typography.Title>
      <Typography.Text type="secondary">Org-wide attendance view with CSV export.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        <Space direction="vertical" size="middle" className="w-full">
          <Space wrap size="middle">
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
              placeholder="Year"
              style={{ width: 120 }}
              options={[
                { label: "2025", value: "2025" },
                { label: "2024", value: "2024" },
              ]}
              value={yearFilter}
              onChange={(v) => setYearFilter(v)}
            />
            <Select
              allowClear
              placeholder="Month"
              style={{ width: 140 }}
              options={[
                { label: "01", value: "01" },
                { label: "02", value: "02" },
                { label: "03", value: "03" },
                { label: "04", value: "04" },
                { label: "05", value: "05" },
                { label: "06", value: "06" },
                { label: "07", value: "07" },
                { label: "08", value: "08" },
                { label: "09", value: "09" },
                { label: "10", value: "10" },
                { label: "11", value: "11" },
                { label: "12", value: "12" },
              ]}
              value={monthFilter}
              onChange={(v) => setMonthFilter(v)}
            />
            <Select
              allowClear
              placeholder="Attendance status"
              style={{ width: 180 }}
              options={[
                { label: "Present", value: "PRESENT" },
                { label: "Half", value: "HALF" },
                { label: "Leave", value: "LEAVE" },
                { label: "Absent", value: "ABSENT" },
                { label: "Holiday", value: "HOLIDAY" },
              ]}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
            />
            <Select
              allowClear
              placeholder="Department"
              style={{ width: 180 }}
              options={departments.map((d) => ({ label: d, value: d }))}
              value={departmentFilter}
              onChange={(v) => setDepartmentFilter(v)}
            />
            <Select
              allowClear
              placeholder="HRMS status"
              style={{ width: 160 }}
              options={hrmsStatuses.map((s) => ({ label: s, value: s }))}
              value={hrmsFilter}
              onChange={(v) => setHrmsFilter(v)}
            />
            <Select
              allowClear
              placeholder="Payroll status"
              style={{ width: 160 }}
              options={payrollStatuses.map((s) => ({ label: s, value: s }))}
              value={payrollFilter}
              onChange={(v) => setPayrollFilter(v)}
            />
            <Select
              allowClear
              placeholder="Employee"
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
            <Input.Search
              allowClear
              placeholder="Search employee (name/email/ID)"
              style={{ width: 240 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Space>
          <Space wrap>
            <Button onClick={() => fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"), userFilter)}>
              Refresh
            </Button>
            <Button type="primary" onClick={() => exportCsv("csv")}>
              Export CSV
            </Button>
            <Button onClick={() => exportCsv("excel")}>Export Excel</Button>
          </Space>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredRecords}
          loading={loading}
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Drawer
        title="Attendance details"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={440}
      >
        {selected ? (
          <div className="space-y-3">
            <Typography.Title level={5} style={{ margin: 0 }}>
              {selected.user.name || selected.user.email}
            </Typography.Title>
            <Typography.Text type="secondary">{dayjs(selected.workDate).format("YYYY-MM-DD")}</Typography.Text>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span>Clock in: {selected.clockIn ? dayjs(selected.clockIn).format("HH:mm") : "—"}</span>
              <span>Clock out: {selected.clockOut ? dayjs(selected.clockOut).format("HH:mm") : "—"}</span>
              <span>Net: {selected.netMinutes}m</span>
              <span>Overtime: {selected.overtimeMinutes}m</span>
            </div>
            <Card size="small" title="Breaks">
              {selected.breaks?.length ? (
                <div className="space-y-2">
                  {selected.breaks.map((b) => {
                    const start = dayjs(b.start).format("HH:mm");
                    const end = b.end ? dayjs(b.end).format("HH:mm") : "In progress";
                    const duration = b.end ? Math.max(0, Math.round((dayjs(b.end).valueOf() - dayjs(b.start).valueOf()) / 60000)) : null;
                    return (
                      <div key={b.id} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-semibold">{b.type === "LUNCH" ? "Lunch" : "External"}</div>
                          <div className="text-xs text-slate-500">
                            {start} → {end}
                            {duration !== null ? ` • ${duration}m` : ""}
                          </div>
                        </div>
                        {b.deductedMinutes ? <Tag color="red">{b.deductedMinutes}m deducted</Tag> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Typography.Text type="secondary">No break data.</Typography.Text>
              )}
            </Card>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
