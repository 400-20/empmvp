"use client";

import { Alert, Card, DatePicker, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

type DwrRow = {
  id: string;
  workDate: string;
  content: string;
  managerNote?: string | null;
  user: { id: string; name?: string | null; email: string };
  createdAt: string;
};

export default function ManagerDwrPage() {
  const [rows, setRows] = useState<DwrRow[]>([]);
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
      const res = await fetch(`/api/manager/dwr?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load DWR");
      setRows(data.reports ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load DWR";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveNote = useCallback(
    async (id: string, note: string) => {
      const res = await fetch("/api/manager/dwr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save note");
      messageApi.success("Note updated");
      fetchData(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"));
    },
    [messageApi, range],
  );

  const columns: ColumnsType<DwrRow> = useMemo(
    () => [
      { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email },
      { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
      { title: "Report", dataIndex: "content" },
      {
        title: "Manager note",
        dataIndex: "managerNote",
        render: (v, record) => (
          <Space direction="vertical" size={4}>
            <span>{v || "—"}</span>
            <a
              onClick={async () => {
                const next = prompt("Add note", v ?? "") ?? undefined;
                if (next !== undefined) {
                  try {
                    await saveNote(record.id, next);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Unable to save note";
                    messageApi.error(msg);
                  }
                }
              }}
            >
              Add/edit note
            </a>
          </Space>
        ),
      },
      { title: "Submitted", dataIndex: "createdAt", render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm") },
    ],
    [saveNote, messageApi],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Team DWR
      </Typography.Title>
      <Typography.Text type="secondary">Review team reports and leave remarks.</Typography.Text>
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
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
