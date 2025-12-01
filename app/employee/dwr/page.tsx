"use client";

import { Alert, Button, Card, DatePicker, Form, Input, Skeleton, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

type DwrRow = {
  id: string;
  workDate: string;
  content: string;
  managerNote?: string | null;
  createdAt: string;
};

export default function EmployeeDwrPage() {
  const [rows, setRows] = useState<DwrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/dwr", { cache: "no-store" });
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

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await fetch("/api/employee/dwr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: values.workDate.format("YYYY-MM-DD"),
          content: values.content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit DWR");
      messageApi.success("DWR submitted");
      form.resetFields();
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to submit DWR";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<DwrRow> = useMemo(
    () => [
      { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
      { title: "Report", dataIndex: "content" },
      { title: "Manager note", dataIndex: "managerNote", render: (v) => v || "—" },
      { title: "Submitted", dataIndex: "createdAt", render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm") },
    ],
    [],
  );

  return (
    <div className="!space-y-2">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Daily Work Report
      </Typography.Title>
      <Typography.Text type="secondary">Submit for today or the last 2 days. Managers can add notes.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card title="Submit DWR" className="brand-card">
        <Form layout="vertical" form={form}>
          <Form.Item name="workDate" label="Date" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="content" label="What did you do?" rules={[{ required: true, min: 3 }]}>
            <Input.TextArea rows={4} placeholder="Key tasks, blockers, highlights" />
          </Form.Item>
          <Button type="primary" onClick={submit} loading={submitting}>
            Submit
          </Button>
        </Form>
      </Card>

      <Card className="brand-card" title="My reports">
        {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
