"use client";

import { Alert, Button, Card, DatePicker, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
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
  user: { id: string; name?: string | null; email: string };
  createdAt: string;
};

export default function ManagerCorrectionsPage() {
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/manager/corrections?${params.toString()}`, { cache: "no-store" });
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
        const res = await fetch("/api/manager/corrections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to update correction");
        messageApi.success(`Correction ${action}d`);
        fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to update correction";
        messageApi.error(msg);
      }
    },
    [messageApi, range],
  );

  const columns: ColumnsType<CorrectionRow> = useMemo(
    () => [
      { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email },
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
          <Tag color={v === "MANAGER_APPROVED" ? "green" : v === "REJECTED" ? "red" : "blue"}>
            {v.replace("_", " ")}
          </Tag>
        ),
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

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (range?.[0] && range?.[1]) {
        params.set("startDate", range[0].format("YYYY-MM-DD"));
        params.set("endDate", range[1].format("YYYY-MM-DD"));
      }
      params.set("format", "csv");
      const res = await fetch(`/api/manager/corrections?${params.toString()}`, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error("Unable to export");
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "corrections-team.csv";
      a.click();
      URL.revokeObjectURL(url);
      messageApi.success("Export ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to export";
      messageApi.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Corrections
      </Typography.Title>
      <Typography.Text type="secondary">Approve or reject correction requests from your team.</Typography.Text>
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
          <div className="mt-2">
            <Typography.Link onClick={exportCsv}>Export CSV</Typography.Link>
          </div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
