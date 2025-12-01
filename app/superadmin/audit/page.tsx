"use client";

import { Alert, Button, Card, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type AuditRow = {
  id: string;
  orgId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  actor?: { id: string; email?: string | null; name?: string | null } | null;
};

function AuditInner() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const orgId = searchParams.get("orgId");

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = orgId ? `?orgId=${orgId}` : "";
        const res = await fetch(`/api/superadmin/audit${query}`, { cache: "no-store" });
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
  }, [orgId]);

  const columns: ColumnsType<AuditRow> = [
    { title: "Action", dataIndex: "action", render: (v) => <Tag>{v}</Tag> },
    { title: "Org", dataIndex: "orgId", render: (v) => v ?? "—" },
    { title: "Entity", dataIndex: "entity" },
    { title: "Entity ID", dataIndex: "entityId", render: (v) => v ?? "—" },
    {
      title: "Actor",
      dataIndex: "actor",
      render: (actor) => (actor ? actor.name || actor.email || actor.id : "System"),
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

  const subtitle = useMemo(() => {
    if (!orgId) return "Last 200 actions across all orgs.";
    return `Last 200 actions for org ${orgId}.`;
  }, [orgId]);

  return (
    <div className="space-y-4">
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Audit log (superadmin)
      </Typography.Title>
      <Typography.Text type="secondary">{subtitle}</Typography.Text>
      {error ? <Alert type="error" message="Unable to load audit log" description={error} /> : null}
      <Card>
        <div className="mb-3 flex items-center justify-end">
          <Button
            type="primary"
            onClick={() => {
              const query = orgId ? `?orgId=${orgId}&format=csv` : "?format=csv";
              window.open(`/api/superadmin/audit${query}`, "_blank");
            }}
          >
            Download CSV
          </Button>
        </div>
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

export default function SuperadminAuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditInner />
    </Suspense>
  );
}
