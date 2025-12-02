"use client";

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Typography,
  message,
} from "antd";
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
  const [teamRows, setTeamRows] = useState<CorrectionRow[]>([]);
  const [myRows, setMyRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [myRange, setMyRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();
  const selectedKind = Form.useWatch("kind", form) || "CLOCK";

  const fetchTeam = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/manager/corrections?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load corrections");
      setTeamRows(data.corrections ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load corrections";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchMine = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/employee/corrections?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load my corrections");
      setMyRows(data.corrections ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load my corrections";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
    fetchMine();
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
        fetchTeam(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to update correction";
        messageApi.error(msg);
      }
    },
    [messageApi, range],
  );

  const teamColumns: ColumnsType<CorrectionRow> = useMemo(
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

  const myColumns: ColumnsType<CorrectionRow> = useMemo(
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
          <Tag color={v === "ADMIN_APPROVED" ? "green" : v === "REJECTED" ? "red" : v === "MANAGER_APPROVED" ? "blue" : "orange"}>
            {v.replace("_", " ")}
          </Tag>
        ),
      },
      {
        title: "Created at",
        dataIndex: "createdAt",
        render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm"),
      },
    ],
    [],
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

  const submitCorrection = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      const payload: any = {
        workDate: values.workDate.format("YYYY-MM-DD"),
        kind: values.kind,
        note: values.note || undefined,
      };
      if (values.kind === "CLOCK" && !values.clockIn && !values.clockOut) {
        throw new Error("Provide a clock in or clock out time.");
      }
      if (values.kind === "BREAK" && !values.breakStart && !values.breakEnd) {
        throw new Error("Provide a break start or end time.");
      }
      if (values.kind === "CLOCK") {
        if (values.clockIn) payload.proposedClockIn = combineDateTime(values.workDate, values.clockIn);
        if (values.clockOut) payload.proposedClockOut = combineDateTime(values.workDate, values.clockOut);
      } else {
        if (values.breakStart) payload.proposedBreakStart = combineDateTime(values.workDate, values.breakStart);
        if (values.breakEnd) payload.proposedBreakEnd = combineDateTime(values.workDate, values.breakEnd);
      }
      const res = await fetch("/api/employee/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to submit correction");
      messageApi.success("Correction submitted to org admin");
      setSubmitOpen(false);
      form.resetFields();
      fetchMine(myRange?.[0]?.format("YYYY-MM-DD"), myRange?.[1]?.format("YYYY-MM-DD"));
    } catch (err) {
      if (err instanceof Error) {
        messageApi.error(err.message);
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Corrections
      </Typography.Title>
      <Typography.Text type="secondary">Team approvals and your own submissions to org admin.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Tabs
        defaultActiveKey="team"
        items={[
          {
            key: "team",
            label: "Team corrections",
            children: (
              <Card>
                <div className="mb-4 flex flex-wrap gap-3 items-center">
                  <DatePicker.RangePicker
                    value={range}
                    onChange={(vals) => {
                      setRange(vals as [Dayjs, Dayjs] | null);
                      if (vals && vals[0] && vals[1]) {
                        fetchTeam(vals[0].format("YYYY-MM-DD"), vals[1].format("YYYY-MM-DD"));
                      } else {
                        fetchTeam();
                      }
                    }}
                  />
                  <Button onClick={() => fetchTeam(range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD"))}>
                    Refresh
                  </Button>
                  <Typography.Link onClick={exportCsv}>Export CSV</Typography.Link>
                </div>
                <Table rowKey="id" columns={teamColumns} dataSource={teamRows} loading={loading} pagination={{ pageSize: 10 }} />
              </Card>
            ),
          },
          {
            key: "self",
            label: "My corrections",
            children: (
              <Card
                title="My submissions"
                extra={
                  <Button type="primary" onClick={() => setSubmitOpen(true)}>
                    New correction
                  </Button>
                }
              >
                <div className="mb-4 flex flex-wrap gap-3 items-center">
                  <DatePicker.RangePicker
                    value={myRange}
                    onChange={(vals) => {
                      setMyRange(vals as [Dayjs, Dayjs] | null);
                      if (vals && vals[0] && vals[1]) {
                        fetchMine(vals[0].format("YYYY-MM-DD"), vals[1].format("YYYY-MM-DD"));
                      } else {
                        fetchMine();
                      }
                    }}
                  />
                  <Button onClick={() => fetchMine(myRange?.[0]?.format("YYYY-MM-DD"), myRange?.[1]?.format("YYYY-MM-DD"))}>
                    Refresh
                  </Button>
                </div>
                <Table rowKey="id" columns={myColumns} dataSource={myRows} loading={loading} pagination={{ pageSize: 10 }} />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="Submit correction to Org Admin"
        open={submitOpen}
        onCancel={() => setSubmitOpen(false)}
        onOk={submitCorrection}
        okText="Submit"
        confirmLoading={submitLoading}
        destroyOnClose
      >
        <Form
          layout="vertical"
          form={form}
          initialValues={{ kind: "CLOCK", workDate: dayjs() }}
        >
          <Form.Item name="workDate" label="Work date" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="kind" label="Correction type" rules={[{ required: true }]}>
            <Select
              onChange={() => form.validateFields(["kind"])}
              options={[
                { label: "Clock times", value: "CLOCK" },
                { label: "Break times", value: "BREAK" },
              ]}
            />
          </Form.Item>
          {selectedKind === "CLOCK" ? (
            <Form.Item label="Clock times">
              <Space>
                <Form.Item name="clockIn" noStyle>
                  <TimePicker format="HH:mm" placeholder="Clock in" />
                </Form.Item>
                <Form.Item name="clockOut" noStyle>
                  <TimePicker format="HH:mm" placeholder="Clock out" />
                </Form.Item>
              </Space>
            </Form.Item>
          ) : null}
          {selectedKind === "BREAK" ? (
            <Form.Item label="Break times">
              <Space>
                <Form.Item name="breakStart" noStyle>
                  <TimePicker format="HH:mm" placeholder="Break start" />
                </Form.Item>
                <Form.Item name="breakEnd" noStyle>
                  <TimePicker format="HH:mm" placeholder="Break end" />
                </Form.Item>
              </Space>
            </Form.Item>
          ) : null}
          <Form.Item name="note" label="Reason / note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={3} placeholder="Explain what needs correction" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function combineDateTime(date: Dayjs, time: Dayjs) {
  const combined = date
    .hour(time.hour())
    .minute(time.minute())
    .second(0)
    .millisecond(0);
  return combined.toISOString();
}
