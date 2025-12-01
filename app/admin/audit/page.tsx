"use client";

import { Alert, Card, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  actor?: { id: string; email?: string | null; name?: string | null } | null;
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/audit", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load audit log");
        setLogs(data.logs ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load audit log";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const columns: ColumnsType<AuditRow> = [
    { title: "Action", dataIndex: "action", render: (v) => <Tag>{v}</Tag> },
    { title: "Entity", dataIndex: "entity" },
    { title: "Entity ID", dataIndex: "entityId", render: (v) => v ?? "—" },
    {
      title: "Actor",
      dataIndex: "actor",
      render: (actor) => actor ? (actor.name || actor.email || actor.id) : "System",
    },
    {
      title: "Timestamp",
      dataIndex: "createdAt",
      render: (v) => new Date(v).toLocaleString(),
    },
    {
      title: "Details",
      key: "details",
      render: (_value, record) => (
        <Space direction="vertical" size={4}>
          {record.before ? (
            <Typography.Text type="secondary">Before: {JSON.stringify(record.before)}</Typography.Text>
          ) : null}
          {record.after ? (
            <Typography.Text type="secondary">After: {JSON.stringify(record.after)}</Typography.Text>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Audit log
      </Typography.Title>
      <Typography.Text type="secondary">
        Last 200 changes for this organisation.
      </Typography.Text>
      {error ? <Alert type="error" message="Unable to load audit log" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  );
}
