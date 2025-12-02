"use client";

import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  XAxis,
  YAxis,
} from "recharts";

type Metrics = {
  usersActive: number;
  managers: number;
  employees: number;
  orgAdmins: number;
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
  const [filters, setFilters] = useState({
    year: undefined as string | undefined,
    month: undefined as string | undefined,
    department: undefined as string | undefined,
    hrmsStatus: undefined as string | undefined,
    payrollStatus: undefined as string | undefined,
    inviteStatus: undefined as string | undefined,
    search: "",
  });

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

  const attendancePieData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: "Present", value: metrics.attendanceToday.present, fill: "#10b981" },
      { name: "Half", value: metrics.attendanceToday.half, fill: "#f59e0b" },
      { name: "Leave", value: metrics.attendanceToday.leave, fill: "#6366f1" },
      { name: "Absent", value: metrics.attendanceToday.absent, fill: "#ef4444" },
      { name: "Holiday", value: metrics.attendanceToday.holiday, fill: "#0ea5e9" },
    ];
  }, [metrics]);

  const headcountBars = useMemo(
    () => [
      { name: "Active users", count: metrics?.usersActive ?? 0 },
      { name: "Managers", count: metrics?.managers ?? 0 },
      { name: "Employees", count: metrics?.employees ?? 0 },
    ],
    [metrics],
  );

  const rosterColumns = [
    { title: "Emp ID", dataIndex: "empId", key: "empId" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Phone", dataIndex: "phone", key: "phone" },
    { title: "DOJ", dataIndex: "doj", key: "doj" },
    { title: "Department", dataIndex: "department", key: "department" },
    { title: "Manager", dataIndex: "manager", key: "manager" },
    { title: "HRMS Status", dataIndex: "hrmsStatus", key: "hrmsStatus" },
    { title: "Payroll Status", dataIndex: "payrollStatus", key: "payrollStatus" },
    { title: "Shift Time", dataIndex: "shiftTime", key: "shiftTime" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Org admin dashboard
          </Typography.Title>
          <Typography.Text type="secondary">
            Org-wide health: headcount, approvals, attendance mix, and payroll readiness.
          </Typography.Text>
        </div>
        <Button type="primary" onClick={fetchMetrics} loading={loading}>
          Refresh
        </Button>
      </div>
      {error ? <Alert type="error" message={error} /> : null}


      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}>
              <Card className="brand-card" loading={loading}>
                <Statistic title="Active users" value={metrics?.usersActive ?? 0} />
                <Typography.Text type="secondary">
                  Org admins: {metrics?.orgAdmins ?? 0} | Managers: {metrics?.managers ?? 0} | Employees: {metrics?.employees ?? 0}
                </Typography.Text>
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
                      / {metrics?.usersActive ?? 0}
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
        </motion.div>
      </AnimatePresence>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card className="brand-card" title="Attendance mix (today)" loading={loading}>
            {attendancePieData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={attendancePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                  />
                  <RechartTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No attendance data" />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card className="brand-card" title="Headcount composition" loading={loading}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={headcountBars}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <RechartTooltip />
                <Legend />
                <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card className="brand-card" title="People directory (snapshot)" extra={<Button type="primary">Add employee</Button>}>
        <Divider style={{ margin: "12px 0" }} />
        <Table
          rowKey="empId"
          columns={rosterColumns}
          dataSource={[]}
          pagination={{ pageSize: 8 }}
          locale={{
            emptyText: (
              <Empty
                description="No employees to show. Import or create users to populate this view."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </Card>

      {loading ? (
        <Card className="brand-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : null}
    </div>
  );
}
