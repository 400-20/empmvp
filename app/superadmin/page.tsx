"use client";

import { GlobalOutlined, InfoCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popover,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type OrgStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

type Org = {
  id: string;
  name: string;
  planName: string;
  status: OrgStatus;
  defaultTimezone?: string | null;
  userLimit?: number | null;
  retentionDays?: number | null;
  screenshotIntervalMinutes?: number | null;
  screenshotRetentionDays?: number | null;
  screenshotMonitoredRoles: string[];
  screenshotPolicyLocked?: boolean | null;
  createdAt: string;
};

type Metrics = {
  summary: {
    orgsTotal: number;
    orgsActive: number;
    orgsSuspended: number;
    orgsDeleted: number;
    usersTotal: number;
    usersActive: number;
    orgAdminsActive: number;
    managersActive: number;
    employeesActive: number;
    screenshotsTotal: number;
    auditCount: number;
  };
};

type OrgFormValues = {
  name: string;
  planName: string;
  defaultTimezone?: string;
  userLimit?: number | null;
  retentionDays?: number | null;
  screenshotIntervalMinutes?: number | null;
  screenshotRetentionDays?: number | null;
  screenshotMonitoredRoles?: string[];
  status?: OrgStatus;
  screenshotPolicyLocked?: boolean;
};

const statusColor: Record<OrgStatus, string> = {
  ACTIVE: "green",
  SUSPENDED: "orange",
  DELETED: "red",
};

const planOptions = [
  { value: "starter", label: "Starter (up to 50 employees)", limit: 50 },
  { value: "growth", label: "Growth (up to 150 employees)", limit: 150 },
  { value: "scale", label: "Scale (up to 500 employees)", limit: 500 },
  { value: "enterprise", label: "Enterprise (500+ custom)", limit: null },
];

const fallbackTimezones = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function buildPayload(
  values: OrgFormValues,
  options: { includeStatus?: boolean; allowNull?: boolean } = {},
) {
  const payload: Record<string, unknown> = {
    name: values.name,
    planName: values.planName,
  };

  if (values.defaultTimezone) payload.defaultTimezone = values.defaultTimezone;
  if (values.screenshotMonitoredRoles) {
    payload.screenshotMonitoredRoles = values.screenshotMonitoredRoles;
  }
  if (values.screenshotPolicyLocked !== undefined) {
    payload.screenshotPolicyLocked = values.screenshotPolicyLocked;
  }

  const numericKeys: (keyof OrgFormValues)[] = [
    "userLimit",
    "retentionDays",
    "screenshotIntervalMinutes",
    "screenshotRetentionDays",
  ];

  numericKeys.forEach((key) => {
    if (values[key] === null) {
      if (options.allowNull) payload[key] = null;
    } else if (typeof values[key] === "number") {
      payload[key] = values[key];
    }
  });

  if (options.includeStatus && values.status) {
    payload.status = values.status;
  }

  return payload;
}

function withInfo(label: string, content: string) {
  return (
    <Space size={6}>
      <span>{label}</span>
      <Popover content={content} trigger="hover">
        <InfoCircleOutlined className="text-gray-400" />
      </Popover>
    </Space>
  );
}

const monitoredRoleOptions = [
  { value: "ALL", label: "All roles (employees, managers, org admins)" },
  { value: "EMPLOYEE", label: "Employees" },
  { value: "MANAGER", label: "Managers" },
  { value: "ORG_ADMIN", label: "Org admins" },
];

function normalizeMonitoredRoles(selected?: string[]) {
  if (!selected || selected.length === 0) return [];
  if (selected.includes("ALL")) {
    return ["EMPLOYEE", "MANAGER", "ORG_ADMIN"];
  }
  return selected;
}

export default function SuperadminPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [adminOrg, setAdminOrg] = useState<Org | null>(null);
  const [manageOrg, setManageOrg] = useState<Org | null>(null);
  const [orgAdmins, setOrgAdmins] = useState<
    { id: string; email: string; name?: string | null; status: string; createdAt: string }[]
  >([]);
  const [orgAdminsLoading, setOrgAdminsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [actionOrgId, setActionOrgId] = useState<string | null>(null);
  const [createForm] = Form.useForm<OrgFormValues>();
  const [editForm] = Form.useForm<OrgFormValues>();
  const [adminForm] = Form.useForm<{ email: string; password: string; name?: string }>();
  const [resetForm] = Form.useForm<{ password: string }>();
  const [messageApi, contextHolder] = message.useMessage();
  const createPlanWatch = Form.useWatch("planName", createForm);
  const editPlanWatch = Form.useWatch("planName", editForm);
  const [detectingTimezone, setDetectingTimezone] = useState(false);
  const handleViewAudit = useCallback((org: Org) => {
    window.open(`/superadmin/audit?orgId=${org.id}`, "_blank");
  }, []);

  const timezoneOptions = useMemo(() => {
    const values =
      typeof Intl !== "undefined" &&
      "supportedValuesOf" in Intl &&
      typeof Intl.supportedValuesOf === "function"
        ? (Intl.supportedValuesOf("timeZone") as string[])
        : fallbackTimezones;

    return values.map((tz) => ({
      label: tz.replace("_", " "),
      value: tz,
    }));
  }, []);

  const applyPlanLimit = useCallback(
    (form: ReturnType<typeof Form.useForm<OrgFormValues>>[0], planValue?: string) => {
      const selected = planOptions.find((p) => p.value === planValue);
      if (!selected) return;
      if (selected.limit) {
        form.setFieldsValue({ userLimit: selected.limit });
      } else if (planValue === "enterprise" && !form.getFieldValue("userLimit")) {
        form.setFieldsValue({ userLimit: 501 });
      }
    },
    [],
  );

  useEffect(() => {
    applyPlanLimit(createForm, createPlanWatch);
  }, [applyPlanLimit, createForm, createPlanWatch]);

  useEffect(() => {
    applyPlanLimit(editForm, editPlanWatch);
  }, [applyPlanLimit, editForm, editPlanWatch]);

  const handleDetectTimezone = useCallback(
    async (target: "create" | "edit") => {
      const form = target === "create" ? createForm : editForm;
      setDetectingTimezone(true);
      try {
        const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (guess) {
          form.setFieldsValue({ defaultTimezone: guess });
          messageApi.success(`Detected timezone: ${guess}`);
          return;
        }

        const res = await fetch("https://worldtimeapi.org/api/ip");
        if (res.ok) {
          const data = await res.json();
          if (data?.timezone) {
            form.setFieldsValue({ defaultTimezone: data.timezone });
            messageApi.success(`Detected timezone from IP: ${data.timezone}`);
            return;
          }
        }
        messageApi.warning("Could not detect timezone. Please select manually.");
      } catch {
        messageApi.warning("Could not detect timezone. Please select manually.");
      } finally {
        setDetectingTimezone(false);
      }
    },
    [createForm, editForm, messageApi],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, metricsRes] = await Promise.all([
        fetch("/api/orgs", { cache: "no-store" }),
        fetch("/api/superadmin/metrics", { cache: "no-store" }),
      ]);
      const orgJson = await orgRes.json();
      const metricsJson = await metricsRes.json();

      if (!orgRes.ok) {
        throw new Error(orgJson.error ?? "Failed to load organisations");
      }
      if (!metricsRes.ok) {
        throw new Error(metricsJson.error ?? "Failed to load metrics");
      }

      setOrgs(orgJson.orgs ?? []);
      setMetrics(metricsJson);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openEdit = useCallback(
    (org: Org) => {
      setEditOrg(org);
      editForm.setFieldsValue({
        name: org.name,
        planName: org.planName,
        defaultTimezone: org.defaultTimezone ?? undefined,
        userLimit: org.userLimit ?? undefined,
        retentionDays: org.retentionDays ?? undefined,
        screenshotIntervalMinutes: org.screenshotIntervalMinutes ?? undefined,
        screenshotRetentionDays: org.screenshotRetentionDays ?? undefined,
        screenshotMonitoredRoles: org.screenshotMonitoredRoles ?? [],
        status: org.status,
        screenshotPolicyLocked: org.screenshotPolicyLocked ?? false,
      });
    },
    [editForm],
  );

  const handleCreate = useCallback(async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);
      const normalized = {
        ...values,
        screenshotMonitoredRoles: normalizeMonitoredRoles(values.screenshotMonitoredRoles),
      };
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(normalized)),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create organisation");
      }
      setOrgs((prev) => [data.org, ...prev]);
      setCreateOpen(false);
      createForm.resetFields();
      messageApi.success("Organisation created");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to create organisation";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [createForm, fetchData, messageApi]);

  const handleUpdate = useCallback(async () => {
    if (!editOrg) return;
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      const normalized = {
        ...values,
        screenshotMonitoredRoles: normalizeMonitoredRoles(values.screenshotMonitoredRoles),
      };
      const res = await fetch(`/api/orgs/${editOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(normalized, { includeStatus: true, allowNull: true })),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update organisation");
      }
      setOrgs((prev) => prev.map((o) => (o.id === data.org.id ? data.org : o)));
      setEditOrg(null);
      messageApi.success("Organisation updated");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to update organisation";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [editForm, editOrg, fetchData, messageApi]);

  const handleStatusChange = useCallback(
    async (org: Org, status: OrgStatus) => {
      try {
        setActionOrgId(org.id);
        const res = await fetch(`/api/orgs/${org.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update status");
        }
        setOrgs((prev) => prev.map((o) => (o.id === data.org.id ? data.org : o)));
        messageApi.success(`Status set to ${status.toLowerCase()}`);
        fetchData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to update status";
        messageApi.error(msg);
      } finally {
        setActionOrgId(null);
      }
    },
    [fetchData, messageApi],
  );

  const confirmDelete = useCallback(
    (org: Org) => {
      Modal.confirm({
        title: `Delete ${org.name}?`,
        content: "This marks the organisation as deleted; data remains for audits.",
        okText: "Mark deleted",
        okButtonProps: { danger: true, loading: actionOrgId === org.id },
        onOk: async () => {
          try {
            setActionOrgId(org.id);
            const res = await fetch(`/api/orgs/${org.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error ?? "Failed to delete organisation");
            }
            setOrgs((prev) => prev.map((o) => (o.id === data.org.id ? data.org : o)));
            messageApi.success("Organisation marked as deleted");
            fetchData();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unable to delete organisation";
            messageApi.error(msg);
          } finally {
            setActionOrgId(null);
          }
        },
      });
    },
    [actionOrgId, fetchData, messageApi],
  );

  const confirmPurge = useCallback(
    (org: Org) => {
      Modal.confirm({
        title: `Permanently delete ${org.name}?`,
        content:
          "This will permanently remove the organisation and all related data (users, attendance, screenshots, audit logs). This cannot be undone.",
        okText: "Delete permanently",
        okButtonProps: { danger: true, loading: actionOrgId === org.id },
        onOk: async () => {
          try {
            setActionOrgId(org.id);
            const res = await fetch(`/api/orgs/${org.id}?hard=true`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error ?? "Failed to permanently delete organisation");
            }
            setOrgs((prev) => prev.filter((o) => o.id !== org.id));
            messageApi.success("Organisation permanently deleted");
            fetchData();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unable to delete organisation";
            messageApi.error(msg);
          } finally {
            setActionOrgId(null);
          }
        },
      });
    },
    [actionOrgId, fetchData, messageApi],
  );

  const handleSignOut = useCallback(() => {
    signOut({ callbackUrl: "/login" });
  }, []);

  const openAdminModal = useCallback(
    (org: Org) => {
      setAdminOrg(org);
      adminForm.resetFields();
    },
    [adminForm],
  );

  const loadOrgAdmins = useCallback(
    async (org: Org) => {
      setOrgAdminsLoading(true);
      try {
        const res = await fetch(`/api/superadmin/orgs/${org.id}/org-admin`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load org admins");
        setOrgAdmins(data.admins ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load org admins";
        messageApi.error(msg);
        setOrgAdmins([]);
      } finally {
        setOrgAdminsLoading(false);
      }
    },
    [messageApi],
  );

  const openManageAdmins = useCallback(
    (org: Org) => {
      setManageOrg(org);
      loadOrgAdmins(org);
    },
    [loadOrgAdmins],
  );

  const handleDeleteAdmin = useCallback(
    async (adminId: string) => {
      if (!manageOrg) return;
      Modal.confirm({
        title: "Remove org admin?",
        content: "This will delete this org admin. At least one active org admin must remain.",
        okButtonProps: { danger: true },
        onOk: async () => {
          setAdminSubmitting(true);
          try {
            const res = await fetch(`/api/superadmin/orgs/${manageOrg.id}/org-admin`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "delete", adminId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to delete org admin");
            messageApi.success("Org admin removed");
            loadOrgAdmins(manageOrg);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unable to delete org admin";
            messageApi.error(msg);
          } finally {
            setAdminSubmitting(false);
          }
        },
      });
    },
    [loadOrgAdmins, manageOrg, messageApi],
  );

  const handleCreateAdmin = useCallback(async () => {
    if (!adminOrg) return;
    try {
      const values = await adminForm.validateFields();
      setAdminSubmitting(true);
      const res = await fetch(`/api/superadmin/orgs/${adminOrg.id}/org-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create org admin");
      }
      messageApi.success("Org admin created");
      setAdminOrg(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to create org admin";
      messageApi.error(msg);
    } finally {
      setAdminSubmitting(false);
    }
  }, [adminForm, adminOrg, messageApi]);

  const handleResetPasswords = useCallback(async () => {
    if (!manageOrg) return;
    try {
      const values = await resetForm.validateFields();
      setAdminSubmitting(true);
      const res = await fetch(`/api/superadmin/orgs/${manageOrg.id}/org-admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-password", password: values.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset passwords");
      messageApi.success(`Updated ${data.updated ?? 0} admin password(s)`);
      resetForm.resetFields();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to reset passwords";
      messageApi.error(msg);
    } finally {
      setAdminSubmitting(false);
    }
  }, [manageOrg, messageApi, resetForm]);

  const columns: ColumnsType<Org> = useMemo(
    () => [
      {
        title: "Name",
        dataIndex: "name",
        key: "name",
        render: (_value, record) => (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Typography.Text type="secondary" className="text-xs">
              {record.defaultTimezone ?? "Timezone not set"}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "Plan",
        dataIndex: "planName",
        key: "plan",
        render: (value, record) => {
          const plan = planOptions.find((p) => p.value === value);
          return (
            <Space direction="vertical" size={0}>
              <Typography.Text>{plan?.label ?? value}</Typography.Text>
              <Typography.Text type="secondary" className="text-xs">
                Limit: {record.userLimit ?? "—"}
              </Typography.Text>
            </Space>
          );
        },
      },
      {
        title: "Limits",
        key: "limits",
        render: (_value, record) => (
          <div className="text-xs">
            <div>Users: {record.userLimit ?? "—"}</div>
            <div>Retention: {record.retentionDays ? `${record.retentionDays}d` : "—"}</div>
          </div>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        render: (value: OrgStatus) => <Tag color={statusColor[value]}>{value}</Tag>,
      },
      {
        title: "Created",
        dataIndex: "createdAt",
        key: "createdAt",
        render: (value: string) => (
          <Typography.Text type="secondary">{formatDate(value)}</Typography.Text>
        ),
      },
      {
        title: "Actions",
        key: "actions",
        render: (_value, record) => (
          <Space size="small">
            <Button size="small" onClick={() => openAdminModal(record)}>
              Add org admin
            </Button>
            <Button size="small" onClick={() => openManageAdmins(record)}>
              Org admins
            </Button>
            <Button size="small" onClick={() => openEdit(record)}>
              Edit
            </Button>
            {record.screenshotPolicyLocked ? <Tag color="blue">Screenshot policy locked</Tag> : null}
            <Button
              size="small"
              loading={actionOrgId === record.id}
              onClick={() =>
                handleStatusChange(record, record.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")
              }
              disabled={record.status === "DELETED"}
            >
              {record.status === "ACTIVE" ? "Suspend" : "Activate"}
            </Button>
            <Button size="small" onClick={() => handleViewAudit(record)}>
              Audit log
            </Button>
            <Button
              size="small"
              danger
              disabled={record.status === "DELETED"}
              loading={actionOrgId === record.id}
              onClick={() => confirmDelete(record)}
            >
              Delete
            </Button>
            {record.status === "DELETED" ? (
              <Button
                size="small"
                danger
                ghost
                loading={actionOrgId === record.id}
                onClick={() => confirmPurge(record)}
              >
                Purge data
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [
      actionOrgId,
      confirmDelete,
      confirmPurge,
      handleStatusChange,
      handleViewAudit,
      openAdminModal,
      openEdit,
      openManageAdmins,
    ],
  );

  return (
    <div className="px-6 py-8">
      {contextHolder}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Superadmin Console
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage organisations, plans, and platform health.
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New organisation
          </Button>
          <Button danger onClick={handleSignOut}>
            Sign out
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert
          type="error"
          message="Could not load data"
          description={error}
          closable
          onClose={() => setError(null)}
          className="mb-4"
        />
      ) : null}

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} md={6}>
          <Card loading={loading}>
            <Statistic
              title="Active orgs"
              value={metrics?.summary.orgsActive ?? 0}
              suffix={`/ ${metrics?.summary.orgsTotal ?? 0}`}
            />
            <Typography.Text type="secondary">
              Suspended: {metrics?.summary.orgsSuspended ?? 0} · Deleted:{" "}
              {metrics?.summary.orgsDeleted ?? 0}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card loading={loading}>
            <Statistic
              title="Active users"
              value={metrics?.summary.usersActive ?? 0}
              suffix={`/ ${metrics?.summary.usersTotal ?? 0}`}
            />
            <Typography.Text type="secondary">
              Org admins: {metrics?.summary.orgAdminsActive ?? 0} • Managers:{" "}
              {metrics?.summary.managersActive ?? 0} • Employees: {metrics?.summary.employeesActive ?? 0}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card loading={loading}>
            <Statistic title="Screenshots" value={metrics?.summary.screenshotsTotal ?? 0} />
            <Typography.Text type="secondary">Platform storage usage (count)</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card loading={loading}>
            <Statistic
              title="Audit entries"
              value={metrics?.summary.auditCount ?? 0}
            />
            <Typography.Text type="secondary">Recent manual changes tracked</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={orgs}
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
        />
      </Card>

      <Modal
        title="Create organisation"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="Create"
        confirmLoading={submitting}
        destroyOnHidden 
        width={1000}
      >
        <Form
          layout="vertical"
          form={createForm}
          initialValues={{ planName: "starter", userLimit: 50, screenshotPolicyLocked: false }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Acme Corp" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="planName" label="Plan" rules={[{ required: true }]}>
                <Select options={planOptions} placeholder="Select plan" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="userLimit"
                label="User limit"
                rules={[{ required: true, message: "User limit required for the selected plan" }]}
              >
                <InputNumber
                  className="w-full"
                  min={1}
                  disabled={(createPlanWatch ?? "starter") !== "enterprise"}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="defaultTimezone" label="Timezone">
                <Select
                  showSearch
                  allowClear
                  options={timezoneOptions}
                  placeholder="Search timezone (e.g. Asia/Kolkata)"
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label=" ">
                <Button
                  icon={<GlobalOutlined />}
                  block
                  onClick={() => handleDetectTimezone("create")}
                  loading={detectingTimezone}
                >
                  Detect timezone
                </Button>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="screenshotIntervalMinutes"
                label={withInfo("Screenshot interval (minutes)", "Capture frequency for monitored roles.")}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="screenshotRetentionDays"
                label={withInfo("Screenshot retention (days)", "How long to keep screenshots before lifecycle cleanup.")}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="retentionDays" label={withInfo("Retention days", "Number of days to retain data (e.g. attendance artifacts).")}>
            <InputNumber className="w-full" min={1} />
          </Form.Item>
          <Form.Item
            name="screenshotMonitoredRoles"
            label={withInfo("Roles monitored for screenshots", "Choose which roles are eligible for screenshot capture.")}
          >
            <Select
              mode="multiple"
              placeholder="Select roles"
              options={monitoredRoleOptions}
            />
          </Form.Item>
          <Form.Item
            name="screenshotPolicyLocked"
            label={withInfo("Lock screenshot policy", "If enabled, org admins cannot change screenshot interval/retention in their settings.")}
          >
            <Select
              options={[
                { value: true, label: "Superadmin sets interval/retention (locked)" },
                { value: false, label: "Org admin can change interval/retention" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Edit ${editOrg?.name ?? ""}`}
        open={!!editOrg}
        onCancel={() => setEditOrg(null)}
        onOk={handleUpdate}
        okText="Save"
        confirmLoading={submitting}
        destroyOnHidden 
      >
        <Form layout="vertical" form={editForm}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="planName" label="Plan" rules={[{ required: true }]}>
                <Select options={planOptions} placeholder="Select plan" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "SUSPENDED", label: "Suspended" },
                    { value: "DELETED", label: "Deleted" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="userLimit"
                label="User limit"
                rules={[{ required: true, message: "User limit required for the selected plan" }]}
              >
                <InputNumber
                  className="w-full"
                  min={1}
                  disabled={(editPlanWatch ?? editForm.getFieldValue("planName")) !== "enterprise"}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultTimezone" label="Timezone">
                <Select
                  showSearch
                  allowClear
                  options={timezoneOptions}
                  placeholder="Search timezone"
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
              <Button
                icon={<GlobalOutlined />}
                block
                onClick={() => handleDetectTimezone("edit")}
                loading={detectingTimezone}
              >
                Detect timezone
              </Button>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="screenshotIntervalMinutes"
                label={withInfo("Screenshot interval (minutes)", "Capture frequency for monitored roles; higher frequency increases storage.")}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="screenshotRetentionDays"
                label={withInfo("Screenshot retention (days)", "How long to keep screenshots before lifecycle cleanup.")}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="retentionDays"
            label={withInfo("Retention days", "Number of days to retain data (e.g. attendance artifacts).")}
          >
            <InputNumber className="w-full" min={1} />
          </Form.Item>
          <Card size="small" bordered className="mb-3">
            <Typography.Text type="secondary">
              Screenshots scale with interval and retention; org admins choose who to monitor.
            </Typography.Text>
          </Card>
          <Form.Item
            name="screenshotMonitoredRoles"
            label={withInfo("Roles monitored for screenshots", "Choose which roles are eligible for screenshot capture.")}
          >
            <Select
              mode="multiple"
              placeholder="Select roles"
              options={monitoredRoleOptions}
            />
          </Form.Item>
          <Form.Item
            name="screenshotPolicyLocked"
            label={withInfo("Lock screenshot policy", "If enabled, org admins cannot change screenshot interval/retention in their settings.")}
          >
            <Select
              options={[
                { value: true, label: "Superadmin sets interval/retention (locked)" },
                { value: false, label: "Org admin can change interval/retention" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Create org admin${adminOrg ? ` for ${adminOrg.name}` : ""}`}
        open={!!adminOrg}
        onCancel={() => setAdminOrg(null)}
        onOk={handleCreateAdmin}
        okText="Create"
        confirmLoading={adminSubmitting}
        destroyOnHidden 
      >
        <Form layout="vertical" form={adminForm}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: "email", message: "Valid email required" }]}
          >
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="name" label="Name">
            <Input placeholder="Org admin name" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
          >
            <Input.Password placeholder="Set a password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Org admins${manageOrg ? ` · ${manageOrg.name}` : ""}`}
        open={!!manageOrg}
        onCancel={() => setManageOrg(null)}
        footer={null}
        width={600}
      >
        <Card size="small" className="mb-4" loading={orgAdminsLoading}>
          {orgAdmins.length === 0 ? (
            <Typography.Text type="secondary">No org admins yet.</Typography.Text>
          ) : (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={orgAdmins}
              columns={[
                { title: "Name", dataIndex: "name", render: (v) => v || "—" },
                { title: "Email", dataIndex: "email" },
                { title: "Status", dataIndex: "status" },
                {
                  title: "Created",
                  dataIndex: "createdAt",
                  render: (v: string) => formatDate(v),
                },
                {
                  title: "Actions",
                  key: "actions",
                  render: (_v, record) => (
                    <Button danger size="small" onClick={() => handleDeleteAdmin(record.id)} loading={adminSubmitting}>
                      Remove
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>
        <Form layout="vertical" form={resetForm}>
          <Form.Item
            name="password"
            label="Reset password for all active org admins"
            rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
          >
            <Input.Password placeholder="New password" />
          </Form.Item>
          <Space>
            <Button onClick={() => setManageOrg(null)}>Close</Button>
            <Button type="primary" onClick={handleResetPasswords} loading={adminSubmitting}>
              Reset passwords
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
