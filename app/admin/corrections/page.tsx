"use client";

import { Alert, Button, Card, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CorrectionKind, CorrectionStatus } from "@prisma/client";

type CorrectionRow = {
  id: string;
  workDate: string;
  kind: CorrectionKind;
  status: CorrectionStatus;
  proposedClockIn?: string | null;
  proposedClockOut?: string | null;
  proposedBreakStart?: string | null;
  proposedBreakEnd?: string | null;
  note?: string | null;
  user: { id: string; name?: string | null; email: string; manager?: { name?: string | null; email: string } | null };
  createdAt: string;
};

export default function AdminCorrectionsPage() {
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CorrectionStatus | undefined>(undefined);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async (statusFilter?: CorrectionStatus) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/corrections?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load corrections");
      setRows(data.corrections ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load corrections";
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
        const res = await fetch("/api/admin/corrections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update");
        messageApi.success(`Correction ${action}d`);
        fetchData(status);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to update correction";
        messageApi.error(msg);
      }
    },
    [messageApi, status],
  );

  const columns: ColumnsType<CorrectionRow> = useMemo(
    () => [
      { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email },
      {
        title: "Manager",
        dataIndex: ["user", "manager"],
        render: (_v, r) => r.user.manager?.name || r.user.manager?.email || "—",
      },
      { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
      { title: "Kind", dataIndex: "kind" },
      {
        title: "Proposed",
        key: "proposed",
        render: (_v, r) => (
          <div className="text-xs space-y-1">
            {r.proposedClockIn ? <div>In: {dayjs(r.proposedClockIn).format("HH:mm")}</div> : null}
            {r.proposedClockOut ? <div>Out: {dayjs(r.proposedClockOut).format("HH:mm")}</div> : null}
            {r.proposedBreakStart ? <div>Break start: {dayjs(r.proposedBreakStart).format("HH:mm")}</div> : null}
            {r.proposedBreakEnd ? <div>Break end: {dayjs(r.proposedBreakEnd).format("HH:mm")}</div> : null}
          </div>
        ),
      },
      { title: "Reason", dataIndex: "note", render: (v) => v || "—" },
      {
        title: "Status",
        dataIndex: "status",
        render: (v) => (
          <Tag color={v === "ADMIN_APPROVED" ? "green" : v === "REJECTED" ? "red" : "blue"}>
            {v.replace("_", " ")}
          </Tag>
        ),
      },
      {
        title: "Actions",
        key: "actions",
        render: (_value, record) => (
          <Space>
            <Button
              size="small"
              type="primary"
              onClick={() => decide(record.id, "approve")}
              disabled={record.status === "ADMIN_APPROVED" || record.status === "REJECTED"}
            >
              Approve
            </Button>
            <Button
              size="small"
              danger
              onClick={() => decide(record.id, "reject")}
              disabled={record.status === "REJECTED"}
            >
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
        Corrections
      </Typography.Title>
      <Typography.Text type="secondary">Review timing corrections and finalize approvals.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 180 }}
            options={Object.values(CorrectionStatus).map((s) => ({ value: s, label: s.replace("_", " ") }))}
            value={status}
            onChange={(val) => {
              setStatus(val);
              fetchData(val);
            }}
          />
        </div>
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 12 }} />
      </Card>
    </div>
  );
}
