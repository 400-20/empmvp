"use client";

import { Alert, Button, Card, DatePicker, Form, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

type LeaveRequest = {
  id: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  status: string;
  reason?: string | null;
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  createdAt: string;
};

type LeaveType = {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
};

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, typeRes] = await Promise.all([
        fetch("/api/leave", { cache: "no-store" }),
        fetch("/api/employee/leave-types", { cache: "no-store" }),
      ]);
      const reqJson = await reqRes.json();
      const typeJson = await typeRes.json();
      if (!reqRes.ok) throw new Error(reqJson.error ?? "Failed to load leave requests");
      if (!typeRes.ok) throw new Error(typeJson.error ?? "Failed to load leave types");
      setRequests(reqJson.requests ?? []);
      setTypes(typeJson.types ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load leave data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const submitRequest = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: values.leaveTypeId,
          startDate: values.dates[0].format("YYYY-MM-DD"),
          endDate: values.dates[1].format("YYYY-MM-DD"),
          isHalfDay: values.isHalfDay === "half",
          reason: values.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit leave");
      messageApi.success("Leave request submitted");
      form.resetFields();
      fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to submit leave";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<LeaveRequest> = [
    {
      title: "Dates",
      dataIndex: "startDate",
      render: (_v, r) => `${dayjs(r.startDate).format("YYYY-MM-DD")} - ${dayjs(r.endDate).format("YYYY-MM-DD")}`,
    },
    {
      title: "Type",
      dataIndex: "leaveType",
      render: (lt) => `${lt.code} (${lt.name})`,
    },
    {
      title: "Half day",
      dataIndex: "isHalfDay",
      render: (v) => (v ? "Yes" : "No"),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (v) => {
        const color =
          v === "APPROVED" ? "green" : v === "REJECTED" ? "red" : v === "PENDING" ? "blue" : "default";
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: "Reason",
      dataIndex: "reason",
      render: (v) => v || "—",
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
  ];

  return (
    <div className="!space-y-2">
      {contextHolder}
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          Leave
        </Typography.Title>
        <Typography.Text type="secondary">Submit and track your leave requests.</Typography.Text>
      </Space>
      {error ? <Alert type="error" message={error} /> : null}
      <Card className="brand-card">
        <Form layout="vertical" form={form}>
          <Form.Item name="leaveTypeId" label="Leave type" rules={[{ required: true }]}>
            <Select
              placeholder="Select leave type"
              options={types.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))}
            />
          </Form.Item>
          <Form.Item name="dates" label="Date range" rules={[{ required: true }]}>
            <DatePicker.RangePicker className="w-full" />
          </Form.Item>
          <Form.Item name="isHalfDay" label="Duration" initialValue="full">
            <Select
              options={[
                { value: "full", label: "Full day" },
                { value: "half", label: "Half day" },
              ]}
            />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={submitRequest} loading={submitting}>
              Submit leave
            </Button>
            <Button onClick={fetchAll} disabled={loading}>
              Refresh
            </Button>
          </Space>
        </Form>
      </Card>

      <Card className="brand-card">
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          My requests
        </Typography.Title>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={requests}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
