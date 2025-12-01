"use client";

import { Alert, Button, Card, DatePicker, Form, Input, Radio, Space, Table, Tag, TimePicker, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
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
  createdAt: string;
};

export default function EmployeeCorrectionsPage() {
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/corrections", { cache: "no-store" });
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

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        workDate: values.workDate.format("YYYY-MM-DD"),
        kind: values.kind,
        note: values.note ?? undefined,
      };
      if (values.kind === "CLOCK") {
        payload.proposedClockIn = values.clockIn ? values.clockIn.toISOString() : undefined;
        payload.proposedClockOut = values.clockOut ? values.clockOut.toISOString() : undefined;
      } else {
        payload.proposedBreakStart = values.breakStart ? values.breakStart.toISOString() : undefined;
        payload.proposedBreakEnd = values.breakEnd ? values.breakEnd.toISOString() : undefined;
      }
      const res = await fetch("/api/employee/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit correction");
      messageApi.success("Correction submitted");
      form.resetFields();
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to submit correction";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<CorrectionRow> = useMemo(
    () => [
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
          <Tag color={v === "ADMIN_APPROVED" || v === "MANAGER_APPROVED" ? "green" : v === "REJECTED" ? "red" : "blue"}>
            {v.replace("_", " ")}
          </Tag>
        ),
      },
      { title: "Requested", dataIndex: "createdAt", render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm") },
    ],
    [],
  );

  return (
    <div className="!space-y-2">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Corrections
      </Typography.Title>
      <Typography.Text type="secondary">Raise a timing correction. Manager then org admin will review.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card title="Request a correction" className="brand-card">
        <Form layout="vertical" form={form} initialValues={{ kind: "CLOCK" }}>
          <Form.Item name="workDate" label="Work date" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="kind" label="Type" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="CLOCK">Clock-in/out</Radio.Button>
              <Radio.Button value="BREAK">Break</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const kind = getFieldValue("kind");
              if (kind === "CLOCK") {
                return (
                  <Space className="w-full" direction="vertical" size="small">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Form.Item name="clockIn" label="Clock in (optional)">
                        <TimePicker className="w-full" format="HH:mm" />
                      </Form.Item>
                      <Form.Item name="clockOut" label="Clock out (optional)">
                        <TimePicker className="w-full" format="HH:mm" />
                      </Form.Item>
                    </div>
                  </Space>
                );
              }
              return (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Form.Item name="breakStart" label="Break start (optional)">
                    <TimePicker className="w-full" format="HH:mm" />
                  </Form.Item>
                  <Form.Item name="breakEnd" label="Break end (optional)">
                    <TimePicker className="w-full" format="HH:mm" />
                  </Form.Item>
                </div>
              );
            }}
          </Form.Item>

          <Form.Item name="note" label="Reason">
            <Input.TextArea rows={3} placeholder="What needs to be fixed?" />
          </Form.Item>

          <Button type="primary" onClick={submit} loading={submitting}>
            Submit correction
          </Button>
        </Form>
      </Card>

      <Card className="brand-card" title="My corrections">
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
