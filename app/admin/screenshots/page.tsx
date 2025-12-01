"use client";

import { Alert, Button, Card, DatePicker, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import { useEffect, useMemo, useState } from "react";

dayjs.extend(isBetween);

type ScreenshotRow = {
  id: string;
  userId: string;
  user?: { name?: string | null; email: string };
  attendanceId?: string | null;
  capturedAt: string;
  url: string;
  thumbnailUrl?: string | null;
  isFlagged: boolean;
};

export default function AdminScreenshotsPage() {
  const [rows, setRows] = useState<ScreenshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), pageSize: "50" });
      const res = await fetch(`/api/screenshots?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load screenshots");
      let filtered = data.screenshots ?? [];
      if (range?.[0] && range?.[1]) {
        const start = range[0].startOf("day");
        const end = range[1].endOf("day");
        filtered = filtered.filter((s: ScreenshotRow) => dayjs(s.capturedAt).isBetween(start, end, null, "[]"));
      }
      setRows(filtered);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load screenshots";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = async () => {
    try {
      const res = await fetch("/api/admin/screenshots/cleanup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cleanup failed");
      messageApi.success(`Deleted ${data.deleted} screenshots older than retention`);
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to cleanup";
      messageApi.error(msg);
    }
  };

  const columns: ColumnsType<ScreenshotRow> = useMemo(
    () => [
      { title: "Captured", dataIndex: "capturedAt", render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm") },
      {
        title: "User",
        dataIndex: "user",
        render: (_v, r) => r.user?.name || r.user?.email || r.userId,
      },
      {
        title: "Preview",
        dataIndex: "thumbnailUrl",
        render: (_v, r) =>
          r.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumbnailUrl} alt="thumb" className="h-12 rounded border" />
          ) : (
            <a href={r.url} target="_blank" rel="noreferrer">
              View
            </a>
          ),
      },
      { title: "Flag", dataIndex: "isFlagged", render: (v) => (v ? <Tag color="red">Flagged</Tag> : <Tag>OK</Tag>) },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Screenshots
      </Typography.Title>
      <Typography.Text type="secondary">
        Monitor captured screenshots and trigger retention cleanup. Retention days follow org settings.
      </Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <DatePicker.RangePicker value={range} onChange={(vals) => setRange(vals as [Dayjs, Dayjs] | null)} />
          <Space>
            <Button onClick={() => fetchData()}>Refresh</Button>
            <Button danger onClick={cleanup}>
              Run cleanup
            </Button>
          </Space>
        </div>
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
    </div>
  );
}
