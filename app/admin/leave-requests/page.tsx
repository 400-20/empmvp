"use client";

import { Alert, Button, Card, DatePicker, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LeaveRequestStatus } from "@prisma/client";

type LeaveRow = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  status: LeaveRequestStatus;
  reason?: string | null;
  createdAt: string;
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  user: { id: string; name?: string | null; email: string; manager?: { name?: string | null; email: string } | null };
};

export default function AdminLeaveApprovals() {
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [status, setStatus] = useState<LeaveRequestStatus | undefined>(undefined);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async (startDate?: string, endDate?: string, statusFilter?: LeaveRequestStatus) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/leave-requests?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load leave requests");
      setRequests(data.requests ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load leave requests";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const decide = useCallback(
    async (id: string, action: "approve" | "reject") => {
      try {
        const res = await fetch("/api/admin/leave-requests", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to update request");
        messageApi.success(`Request ${action}d`);
        fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"), status);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to update request";
        messageApi.error(msg);
      }
    },
    [messageApi, range, status],
  );

  const columns: ColumnsType<LeaveRow> = useMemo(
    () => [
      { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email },
      {
        title: "Manager",
        dataIndex: ["user", "manager"],
        render: (_v, r) => r.user.manager?.name || r.user.manager?.email || "—",
      },
      {
        title: "Dates",
        dataIndex: "startDate",
        render: (_v, record) =>
          `${dayjs(record.startDate).format("YYYY-MM-DD")} – ${dayjs(record.endDate).format("YYYY-MM-DD")}`,
      },
      { title: "Type", dataIndex: "leaveType", render: (lt) => `${lt.code} (${lt.name})` },
      { title: "Half-day", dataIndex: "isHalfDay", render: (v) => (v ? "Yes" : "No") },
      { title: "Reason", dataIndex: "reason", render: (v) => v || "—" },
      {
        title: "Status",
        dataIndex: "status",
        render: (v) => <Tag color={v === "APPROVED" ? "green" : v === "REJECTED" ? "red" : "blue"}>{v}</Tag>,
      },
      {
        title: "Actions",
        key: "actions",
        render: (_value, record) => (
          <Space>
            <Button size="small" type="primary" onClick={() => decide(record.id, "approve")} disabled={record.status !== "PENDING"}>
              Approve
            </Button>
            <Button size="small" danger onClick={() => decide(record.id, "reject")} disabled={record.status !== "PENDING"}>
              Reject
            </Button>
          </Space>
        ),
      },
    ],
    [decide],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Leave approvals
      </Typography.Title>
      <Typography.Text type="secondary">Org-wide leave requests. Approvals here override team decisions.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <DatePicker.RangePicker
            value={range}
            onChange={(vals) => {
              setRange(vals as [Dayjs, Dayjs] | null);
              const startDate = vals?.[0]?.format("YYYY-MM-DD");
              const endDate = vals?.[1]?.format("YYYY-MM-DD");
              fetchData(startDate, endDate, status);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 180 }}
            options={[
              { value: LeaveRequestStatus.PENDING, label: "Pending" },
              { value: LeaveRequestStatus.APPROVED, label: "Approved" },
              { value: LeaveRequestStatus.REJECTED, label: "Rejected" },
              { value: LeaveRequestStatus.CANCELLED, label: "Cancelled" },
            ]}
            value={status}
            onChange={(val) => {
              setStatus(val);
              fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"), val);
            }}
          />
        </div>
        <Table rowKey="id" columns={columns} dataSource={requests} loading={loading} pagination={{ pageSize: 12 }} />
      </Card>
    </div>
  );
}
