"use client";

import { Alert, Card, Col, Row, Skeleton, Statistic, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

type Metrics = {
  usersActive: number;
  managers: number;
  employees: number;
  pendingLeave: number;
  pendingCorrections: number;
  attendanceToday: {
    present: number;
    half: number;
    leave: number;
    absent: number;
    holiday: number;
  };
};

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load dashboard");
      setMetrics(data.metrics);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load dashboard";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  return (
    <div className="space-y-4">
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Org admin dashboard
      </Typography.Title>
      <Typography.Text type="secondary">
        Snapshot of your org: usage, pending approvals, and today&apos;s attendance.
      </Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card className="brand-card" loading={loading}>
            <Statistic title="Active users" value={metrics?.usersActive ?? 0} />
            <Typography.Text type="secondary">Managers: {metrics?.managers ?? 0} | Employees: {metrics?.employees ?? 0}</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="brand-card" loading={loading}>
            <Statistic title="Pending leave" value={metrics?.pendingLeave ?? 0} />
            <Typography.Text type="secondary">Awaiting manager/admin decision</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="brand-card" loading={loading}>
            <Statistic title="Pending corrections" value={metrics?.pendingCorrections ?? 0} />
            <Typography.Text type="secondary">Employee or manager requested</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="brand-card" loading={loading}>
            <Statistic
              title="Today present"
              value={metrics?.attendanceToday.present ?? 0}
              suffix={
                <Typography.Text type="secondary">
                  / {((metrics?.attendanceToday.present ?? 0) +
                    (metrics?.attendanceToday.absent ?? 0) +
                    (metrics?.attendanceToday.leave ?? 0) +
                    (metrics?.attendanceToday.half ?? 0) +
                    (metrics?.attendanceToday.holiday ?? 0)) || 0}
                </Typography.Text>
              }
            />
            <div className="flex gap-2 text-xs text-slate-600">
              <Tag>Half {metrics?.attendanceToday.half ?? 0}</Tag>
              <Tag>Leave {metrics?.attendanceToday.leave ?? 0}</Tag>
              <Tag>Absent {metrics?.attendanceToday.absent ?? 0}</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      {loading ? (
        <Card className="brand-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : null}
    </div>
  );
}
