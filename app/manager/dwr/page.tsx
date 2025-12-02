"use client";

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

type TeamDwrRow = {
  id: string;
  workDate: string;
  content: string;
  managerNote?: string | null;
  status: "UNCONFIRMED" | "APPROVED" | "REJECTED";
  approvedAt?: string | null;
  approvedBy?: { id: string; name?: string | null; email?: string | null; role?: string | null } | null;
  user: { id: string; name?: string | null; email: string; role?: string | null };
  createdAt: string;
};

type SelfDwrRow = {
  id: string;
  workDate: string;
  content: string;
  managerNote?: string | null;
  status: "UNCONFIRMED" | "APPROVED" | "REJECTED";
  approvedAt?: string | null;
  approvedBy?: { id: string; name?: string | null; email?: string | null };
  createdAt: string;
};

export default function ManagerDwrPage() {
  const [teamRows, setTeamRows] = useState<TeamDwrRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamRange, setTeamRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [roleFilters, setRoleFilters] = useState<Array<"EMPLOYEE" | "MANAGER" | "ORG_ADMIN">>(["EMPLOYEE", "MANAGER"]);

  const [selfRows, setSelfRows] = useState<SelfDwrRow[]>([]);
  const [selfLoading, setSelfLoading] = useState(false);
  const [selfError, setSelfError] = useState<string | null>(null);
  const [selfRange, setSelfRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<"ORG_ADMIN" | "MANAGER" | string | null>(null);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<TeamDwrRow | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState<"approve" | "reject" | null>(null);

  const [messageApi, contextHolder] = message.useMessage();

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await res.json();
      setCurrentUserId(data?.user?.id ?? null);
      setCurrentRole((data?.user?.role as any) ?? null);
    } catch {
      setCurrentUserId(null);
      setCurrentRole(null);
    }
  }, []);

  const fetchTeamReports = useCallback(async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const params = new URLSearchParams();
      if (teamRange?.[0] && teamRange?.[1]) {
        params.set("startDate", teamRange[0].format("YYYY-MM-DD"));
        params.set("endDate", teamRange[1].format("YYYY-MM-DD"));
      }
      if (teamSearch.trim()) {
        params.set("search", teamSearch.trim());
      }
      if (roleFilters.length && roleFilters.length < 3) {
        params.set("roles", roleFilters.join(","));
      }
      const res = await fetch(`/api/manager/dwr?${params.toString()}`, { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error ?? "Failed to load DWR");
      setTeamRows(data.reports ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load DWR";
      setTeamError(msg);
    } finally {
      setTeamLoading(false);
    }
  }, [roleFilters, teamRange, teamSearch]);

  const fetchSelfReports = useCallback(
    async (startDate?: string, endDate?: string) => {
      setSelfLoading(true);
      setSelfError(null);
      try {
        const params = new URLSearchParams();
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        const res = await fetch(`/api/employee/dwr?${params.toString()}`, { cache: "no-store" });
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(data.error ?? "Failed to load your DWR");
        setSelfRows(data.reports ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load your DWR";
        setSelfError(msg);
      } finally {
        setSelfLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    fetchTeamReports();
  }, [fetchTeamReports]);

  useEffect(() => {
    if (selfRange?.[0] && selfRange?.[1]) {
      fetchSelfReports(selfRange[0].format("YYYY-MM-DD"), selfRange[1].format("YYYY-MM-DD"));
    } else {
      fetchSelfReports();
    }
  }, [fetchSelfReports, selfRange]);

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
      fetchTeamReports();
    },
    [messageApi, fetchTeamReports],
  );

  const decide = useCallback(
    async (id: string, action: "approve" | "reject") => {
      const res = await fetch("/api/manager/dwr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      messageApi.success(action === "approve" ? "DWR approved" : "DWR rejected");
      fetchTeamReports();
    },
    [messageApi, fetchTeamReports],
  );

  const submitSelfDwr = useCallback(async () => {
    try {
      const values = await submitForm.validateFields();
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
      setSubmitOpen(false);
      submitForm.resetFields();
      fetchSelfReports(selfRange?.[0]?.format("YYYY-MM-DD"), selfRange?.[1]?.format("YYYY-MM-DD"));
      fetchTeamReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to submit DWR";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [fetchSelfReports, fetchTeamReports, messageApi, selfRange, submitForm]);

  const openDetail = useCallback((record: TeamDwrRow) => {
    setSelected(record);
    setNoteDraft(record.managerNote ?? "");
    setDetailOpen(true);
  }, []);

  const canManageRecord = useCallback(
    (record: TeamDwrRow) => {
      if (currentRole === "ORG_ADMIN") return true;
      if (currentRole === "MANAGER" && record.user.role !== "MANAGER") return true;
      return false;
    },
    [currentRole],
  );

  const handleSaveNote = async () => {
    if (!selected) return;
    setNoteSaving(true);
    try {
      await saveNote(selected.id, noteDraft);
      setSelected({ ...selected, managerNote: noteDraft });
      setTeamRows((rows) => rows.map((r) => (r.id === selected.id ? { ...r, managerNote: noteDraft } : r)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save note";
      messageApi.error(msg);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDecision = async (action: "approve" | "reject") => {
    if (!selected) return;
    setDecisionLoading(action);
    try {
      await decide(selected.id, action);
      const nextStatus = action === "approve" ? "APPROVED" : "REJECTED";
      setSelected({ ...selected, status: nextStatus });
      setTeamRows((rows) => rows.map((r) => (r.id === selected.id ? { ...r, status: nextStatus } : r)));
      fetchTeamReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to update status";
      messageApi.error(msg);
    } finally {
      setDecisionLoading(null);
    }
  };

  const teamColumns: ColumnsType<TeamDwrRow> = useMemo(
    () => [
      { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD"), width: 120 },
      { title: "Employee", dataIndex: ["user", "name"], render: (_v, r) => r.user.name || r.user.email, width: 200 },
      { title: "Role", dataIndex: ["user", "role"], render: (v) => v ?? "-", width: 110 },
      {
        title: "Report",
        dataIndex: "content",
        render: (v) => (
          <Typography.Paragraph ellipsis={{ rows: 2, tooltip: v }} style={{ marginBottom: 0 }}>
            {v}
          </Typography.Paragraph>
        ),
      },
      {
        title: "Manager note",
        dataIndex: "managerNote",
        render: (v, record) => (
          <Space direction="vertical" size={4}>
            <span>{v || "-"}</span>
            {canManageRecord(record) ? (
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
                Quick edit
              </a>
            ) : null}
          </Space>
        ),
        width: 180,
      },
      {
        title: "Status",
        dataIndex: "status",
        render: (v, record) => {
          const color = v === "APPROVED" ? "green" : v === "REJECTED" ? "red" : "default";
          return (
            <Space direction="vertical" size={2}>
              <Tag color={color === "default" ? undefined : color}>{v}</Tag>
              {record.approvedBy ? (
                <Typography.Text type="secondary" className="text-xs">
                  By {record.approvedBy.name || record.approvedBy.email || record.approvedBy.id}{" "}
                  {record.approvedAt ? `on ${dayjs(record.approvedAt).format("YYYY-MM-DD")}` : ""}
                </Typography.Text>
              ) : null}
            </Space>
          );
        },
        width: 180,
      },
      { title: "Submitted", dataIndex: "createdAt", render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm"), width: 170 },
      {
        title: "DWR",
        key: "view",
        render: (_v, record) => (
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>
            Open
          </Button>
        ),
        fixed: "right",
        width: 110,
      },
      {
        title: "Actions",
        key: "actions",
        render: (_v, record) => (
          <Space>
            <Button
              size="small"
              type="primary"
              disabled={record.status === "APPROVED" || !canManageRecord(record)}
              onClick={() => decide(record.id, "approve")}
            >
              Approve
            </Button>
            <Button
              size="small"
              danger
              disabled={record.status === "REJECTED" || !canManageRecord(record)}
              onClick={() => decide(record.id, "reject")}
            >
              Reject
            </Button>
          </Space>
        ),
        fixed: "right",
        width: 180,
      },
    ],
    [canManageRecord, decide, messageApi, openDetail, saveNote],
  );

  const selfColumns: ColumnsType<SelfDwrRow> = useMemo(
    () => [
      { title: "Date", dataIndex: "workDate", render: (v) => dayjs(v).format("YYYY-MM-DD") },
      { title: "Report", dataIndex: "content" },
      { title: "Manager note", dataIndex: "managerNote", render: (v) => v || "-" },
      {
        title: "Status",
        dataIndex: "status",
        render: (v, record) => (
          <Space direction="vertical" size={2}>
            <Tag color={v === "APPROVED" ? "green" : v === "REJECTED" ? "red" : undefined}>{v}</Tag>
            {record.approvedBy ? (
              <Typography.Text type="secondary" className="text-xs">
                By {record.approvedBy.name || record.approvedBy.email}{" "}
                {record.approvedAt ? `on ${dayjs(record.approvedAt).format("YYYY-MM-DD")}` : ""}
              </Typography.Text>
            ) : null}
          </Space>
        ),
      },
      { title: "Submitted", dataIndex: "createdAt", render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm") },
    ],
    [],
  );

  const filteredTeamRows = useMemo(
    () => (currentUserId ? teamRows.filter((row) => row.user.id !== currentUserId) : teamRows),
    [teamRows, currentUserId],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Daily Work Reports
          </Typography.Title>
          <Typography.Text type="secondary">
            Your own submissions and your team queue are split to reduce clutter.
          </Typography.Text>
        </div>
        <Button type="primary" onClick={() => setSubmitOpen(true)}>
          Submit my DWR
        </Button>
      </div>

      <Tabs
        defaultActiveKey="team"
        items={[
          {
            key: "team",
            label: "Team DWR",
            children: (
              <div className="space-y-3">
                {teamError ? <Alert type="error" message={teamError} /> : null}
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Space wrap>
                      <DatePicker.RangePicker
                        value={teamRange}
                        onChange={(vals) => {
                          setTeamRange(vals as [Dayjs, Dayjs] | null);
                        }}
                      />
                      <Input.Search
                        allowClear
                        placeholder="Search by name or email"
                        style={{ width: 240 }}
                        onSearch={(val) => setTeamSearch(val)}
                        onChange={(e) => setTeamSearch(e.target.value)}
                        value={teamSearch}
                      />
                      <Space size={6} wrap>
                        {[
                          { value: "EMPLOYEE", label: "Employees" },
                          { value: "MANAGER", label: "Managers" },
                        ].map((pill) => (
                          <Tag.CheckableTag
                            key={pill.value}
                            checked={roleFilters.includes(pill.value as any)}
                            onChange={(checked) => {
                              setRoleFilters((prev) => {
                                const next = checked
                                  ? [...new Set([...prev, pill.value as any])]
                                  : prev.filter((v) => v !== pill.value);
                                return next.length ? next : ["EMPLOYEE", "MANAGER"];
                              });
                            }}
                          >
                            {pill.label}
                          </Tag.CheckableTag>
                        ))}
                      </Space>
                    </Space>
                    <Typography.Text type="secondary" className="text-xs">
                      Only your managed teams and self (self hidden here once session loads).
                    </Typography.Text>
                  </div>
                  <Table
                    rowKey="id"
                    columns={teamColumns}
                    dataSource={filteredTeamRows}
                    loading={teamLoading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 1100 }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: "self",
            label: "My DWR",
            children: (
              <div className="space-y-3">
                {selfError ? <Alert type="error" message={selfError} /> : null}
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <DatePicker.RangePicker
                      value={selfRange}
                      onChange={(vals) => {
                        setSelfRange(vals as [Dayjs, Dayjs] | null);
                      }}
                    />
                    <Typography.Text type="secondary" className="text-xs">
                      You can submit for today and the last 2 days.
                    </Typography.Text>
                  </div>
                  <Table
                    rowKey="id"
                    columns={selfColumns}
                    dataSource={selfRows}
                    loading={selfLoading}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title="Submit DWR"
        open={submitOpen}
        onCancel={() => setSubmitOpen(false)}
        onOk={submitSelfDwr}
        okText="Submit"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={submitForm} initialValues={{ workDate: dayjs() }}>
          <Form.Item name="workDate" label="Date" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="content" label="What did you do?" rules={[{ required: true, min: 3 }]}>
            <Input.TextArea rows={4} placeholder="Key tasks, blockers, highlights" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="Daily Work Report"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={520}
        destroyOnClose
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {selected.user.name || selected.user.email}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {dayjs(selected.workDate).format("YYYY-MM-DD")} • {selected.user.email}
                </Typography.Text>
              </div>
              <Space>
                <Tag>{selected.user.role ?? "-"}</Tag>
                <Tag color={selected.status === "APPROVED" ? "green" : selected.status === "REJECTED" ? "red" : "default"}>
                  {selected.status}
                </Tag>
              </Space>
            </div>

            <Card size="small" title="Report">
              <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                {selected.content}
              </Typography.Paragraph>
            </Card>

            <Form layout="vertical">
              <Form.Item label="Manager note">
                <Input.TextArea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={4}
                  placeholder="Add remarks or feedback"
                  disabled={!canManageRecord(selected)}
                />
              </Form.Item>
              <Space wrap>
                <Button onClick={handleSaveNote} loading={noteSaving} disabled={!canManageRecord(selected)}>
                  Save note
                </Button>
                <Button
                  type="primary"
                  onClick={() => handleDecision("approve")}
                  loading={decisionLoading === "approve"}
                  disabled={selected.status === "APPROVED" || !canManageRecord(selected)}
                >
                  Approve
                </Button>
                <Button
                  danger
                  onClick={() => handleDecision("reject")}
                  loading={decisionLoading === "reject"}
                  disabled={selected.status === "REJECTED" || !canManageRecord(selected)}
                >
                  Reject
                </Button>
              </Space>
            </Form>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
