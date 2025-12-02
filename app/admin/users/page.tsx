"use client";

import { FileExcelOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  managerId?: string | null;
  manager?: { id: string; name?: string | null; email: string };
  empCode?: string | null;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  doj?: string | null;
  hrmsStatus?: string | null;
  payrollStatus?: string | null;
  inviteStatus?: string | null;
  shiftStartMinutes?: number | null;
  shiftEndMinutes?: number | null;
  shiftLabel?: string | null;
  createdAt: string;
};

type UserFormValues = {
  id?: string;
  email: string;
  name?: string;
  role: "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  managerId?: string | null;
  password?: string;
  empCode?: string;
  phone?: string;
  department?: string;
  designation?: string;
  doj?: string;
  hrmsStatus?: string;
  payrollStatus?: string;
  inviteStatus?: string;
  shiftStart?: string;
  shiftEnd?: string;
  shiftLabel?: string;
};

type ImportResult = {
  created: { email: string; name?: string | null; role: string; status: string; managerEmail?: string | null; password: string }[];
  failed: { row: number; email?: string; reason: string }[];
  remainingSlots?: number | null;
};

const roleOptions = [
  { value: "ORG_ADMIN", label: "Org admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "EMPLOYEE", label: "Employee" },
];

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
];

const hrmsStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "YET_TO_JOIN", label: "Yet to join" },
];

const payrollStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const inviteStatusOptions = [
  { value: "INVITED", label: "Invited" },
  { value: "PENDING", label: "Pending" },
  { value: "JOINED", label: "Joined" },
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [form] = Form.useForm<UserFormValues>();
  const [messageApi, contextHolder] = message.useMessage();

  const minutesToTime = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return "";
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      setUsers(data.users ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load users";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({
      role: "EMPLOYEE",
      hrmsStatus: "ACTIVE",
      payrollStatus: "ACTIVE",
      inviteStatus: "INVITED",
    });
    setModalOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      status: user.status,
      managerId: user.managerId ?? undefined,
      empCode: user.empCode ?? undefined,
      phone: user.phone ?? undefined,
      department: user.department ?? undefined,
      designation: user.designation ?? undefined,
      doj: user.doj ? user.doj.slice(0, 10) : undefined,
      hrmsStatus: user.hrmsStatus ?? undefined,
      payrollStatus: user.payrollStatus ?? undefined,
      inviteStatus: user.inviteStatus ?? undefined,
      shiftStart: minutesToTime(user.shiftStartMinutes),
      shiftEnd: minutesToTime(user.shiftEndMinutes),
      shiftLabel: user.shiftLabel ?? undefined,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingUser) {
        const res = await fetch("/api/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: values.id,
              name: values.name,
              role: values.role,
              status: values.status,
              managerId: values.managerId ?? null,
              password: values.password || undefined,
              empCode: values.empCode || null,
              phone: values.phone || null,
              department: values.department || null,
              designation: values.designation || null,
              doj: values.doj || null,
              hrmsStatus: values.hrmsStatus || undefined,
              payrollStatus: values.payrollStatus || undefined,
              inviteStatus: values.inviteStatus || undefined,
              shiftStart: values.shiftStart || null,
              shiftEnd: values.shiftEnd || null,
              shiftLabel: values.shiftLabel || null,
            }),
          });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update user");
        messageApi.success("User updated");
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: values.email,
              name: values.name,
              role: values.role,
              password: values.password,
              managerId: values.managerId ?? null,
              empCode: values.empCode || null,
              phone: values.phone || null,
              department: values.department || null,
              designation: values.designation || null,
              doj: values.doj || null,
              hrmsStatus: values.hrmsStatus || undefined,
              payrollStatus: values.payrollStatus || undefined,
              inviteStatus: values.inviteStatus || undefined,
              shiftStart: values.shiftStart || null,
              shiftEnd: values.shiftEnd || null,
              shiftLabel: values.shiftLabel || null,
            }),
          });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create user");
        messageApi.success("User created");
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to submit user";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const managerOptions = useMemo(
    () =>
      users
        .filter((u) => u.role === "MANAGER" || u.role === "ORG_ADMIN")
        .map((u) => ({
          value: u.id,
          label: u.name ? `${u.name} (${u.email})` : u.email,
        })),
    [users],
  );

  const sampleCsv = `email,name,role,managerEmail,status,password,empCode,phone,department,designation,doj,hrmsStatus,payrollStatus,inviteStatus,shiftStart,shiftEnd,shiftLabel
jane.employee@example.com,Jane Employee,EMPLOYEE,,ACTIVE,,EMP-001,+91-9000000000,Engineering,Developer,2025-01-10,ACTIVE,ACTIVE,INVITED,09:00,18:00,Day shift
raj.manager@example.com,Raj Manager,MANAGER,,ACTIVE,Temp@12345,EMP-010,+91-9888888888,Product,Manager,2024-12-01,ACTIVE,ACTIVE,JOINED,10:00,19:00,Manager shift
admin.one@example.com,Alex Admin,ORG_ADMIN,,ACTIVE,Admin@12345,EMP-100,+91-9777777777,Ops,Admin,2024-11-15,ACTIVE,ACTIVE,INVITED,09:00,18:00,`;

  const handleImportFile: UploadProps["beforeUpload"] = async (file) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/users/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportResult(data);
      const createdCount = data.created?.length ?? 0;
      const failedCount = data.failed?.length ?? 0;
      messageApi.success(`Import complete. Created ${createdCount}, failed ${failedCount}.`);
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to import users";
      messageApi.error(msg);
    } finally {
      setImporting(false);
    }
    return false;
  };

  const downloadTemplate = () => {
    const blob = new Blob([sampleCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (_value, record) => (
        <div>
          <Typography.Text strong>{record.name || "—"}</Typography.Text>
          <div className="text-xs text-gray-500">{record.email}</div>
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      render: (role) => roleOptions.find((r) => r.value === role)?.label ?? role,
    },
    {
      title: "Emp ID",
      dataIndex: "empCode",
      render: (v) => v || "—",
    },
    {
      title: "Department",
      dataIndex: "department",
      render: (v) => v || "—",
    },
    {
      title: "Phone",
      dataIndex: "phone",
      render: (v) => v || "—",
    },
    {
      title: "HRMS status",
      dataIndex: "hrmsStatus",
      render: (v) => v || "—",
    },
    {
      title: "Payroll status",
      dataIndex: "payrollStatus",
      render: (v) => v || "—",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag>{status}</Tag>,
    },
    {
      title: "Shift",
      key: "shift",
      render: (_value, record) => {
        const start = minutesToTime(record.shiftStartMinutes);
        const end = minutesToTime(record.shiftEndMinutes);
        return record.shiftLabel || (start && end ? `${start} - ${end}` : "—");
      },
    },
    {
      title: "Manager",
      dataIndex: "manager",
      render: (_value, record) =>
        record.manager ? record.manager.name || record.manager.email : "—",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_value, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {contextHolder}
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Users
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage employees, managers, and org admins for this organisation.
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New user
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" message="Unable to load users" description={error} /> : null}

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Card title="Bulk import users" extra={<Button icon={<FileExcelOutlined />} onClick={downloadTemplate}>Download template</Button>}>
        <Typography.Paragraph type="secondary">
          Upload a CSV with headers: <code>email, name, role, managerEmail, status, password</code>. Role accepts
          ORG_ADMIN, MANAGER, EMPLOYEE. Leave managerEmail blank to default to you (org admin). Password column is
          optional; if blank we generate a strong one for you.
        </Typography.Paragraph>
        <Upload
          accept=".csv"
          multiple={false}
          showUploadList={false}
          beforeUpload={handleImportFile}
          disabled={importing}
        >
          <Button icon={<UploadOutlined />} loading={importing} type="primary">
            Upload CSV
          </Button>
        </Upload>

        {importResult ? (
          <div className="mt-4 space-y-3">
            <Alert
              type="info"
              message={`Created ${importResult.created?.length ?? 0} user(s). ${importResult.failed?.length ?? 0} failed.`}
              description={
                importResult.remainingSlots !== null && importResult.remainingSlots !== undefined
                  ? `Remaining active user slots: ${importResult.remainingSlots}`
                  : "No plan limit enforced for active users."
              }
            />
            {importResult.created?.length ? (
              <Card size="small" title="New accounts">
                <Table
                  size="small"
                  rowKey="email"
                  pagination={false}
                  dataSource={importResult.created}
                  columns={[
                    { title: "Email", dataIndex: "email" },
                    { title: "Role", dataIndex: "role" },
                    { title: "Status", dataIndex: "status" },
                    { title: "Manager", dataIndex: "managerEmail", render: (v) => v || "Defaulted to org admin" },
                    { title: "Password", dataIndex: "password" },
                  ]}
                />
              </Card>
            ) : null}
            {importResult.failed?.length ? (
              <Card size="small" title="Rows that need attention">
                <Table
                  size="small"
                  rowKey={(r) => `${r.row}-${r.email ?? r.reason}`}
                  pagination={false}
                  dataSource={importResult.failed}
                  columns={[
                    { title: "Row", dataIndex: "row" },
                    { title: "Email", dataIndex: "email", render: (v) => v || "-" },
                    { title: "Reason", dataIndex: "reason" },
                  ]}
                />
              </Card>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Modal
        title={editingUser ? "Edit user" : "Create user"}
      open={modalOpen}
      onCancel={() => setModalOpen(false)}
      onOk={handleSubmit}
      okText={editingUser ? "Save" : "Create"}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form layout="vertical" form={form}>
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        {!editingUser ? (
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: "email" }]}
          >
              <Input placeholder="user@example.com" />
            </Form.Item>
        ) : (
          <Form.Item label="Email">
            <Input value={editingUser.email} disabled />
          </Form.Item>
        )}
        <Form.Item name="name" label="Name">
          <Input placeholder="Full name" />
        </Form.Item>
        <Form.Item name="role" label="Role" rules={[{ required: true }]}>
          <Select options={roleOptions} />
        </Form.Item>
        {editingUser ? (
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
        ) : null}
        <Form.Item
          name="managerId"
          label="Manager (optional)"
          extra="If left empty, manager defaults to you (org admin)."
        >
          <Select
            allowClear
            placeholder="Select manager"
            options={managerOptions}
          />
        </Form.Item>

        <Form.Item name="empCode" label="Employee ID">
          <Input placeholder="EMP-001" />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input placeholder="+91-90000-00000" />
        </Form.Item>
        <Form.Item name="department" label="Department">
          <Input placeholder="Engineering, Finance, HR" />
        </Form.Item>
        <Form.Item name="designation" label="Designation">
          <Input placeholder="Senior Engineer, Manager, Analyst" />
        </Form.Item>
        <Form.Item name="doj" label="Date of joining">
          <Input type="date" />
        </Form.Item>
        <Form.Item name="hrmsStatus" label="HRMS status">
          <Select options={hrmsStatusOptions} />
        </Form.Item>
        <Form.Item name="payrollStatus" label="Payroll status">
          <Select options={payrollStatusOptions} />
        </Form.Item>
        <Form.Item name="inviteStatus" label="Invite status">
          <Select options={inviteStatusOptions} />
        </Form.Item>
        <Form.Item label="Shift timing (24h)">
          <Space>
            <Form.Item name="shiftStart" noStyle>
              <Input type="time" />
            </Form.Item>
            <Typography.Text type="secondary">to</Typography.Text>
            <Form.Item name="shiftEnd" noStyle>
              <Input type="time" />
            </Form.Item>
          </Space>
        </Form.Item>
        <Form.Item name="shiftLabel" label="Shift label">
          <Input placeholder="Morning, Night, Hybrid" />
        </Form.Item>

        <Form.Item
          name="password"
          label={editingUser ? "Password (leave blank to keep)" : "Password"}
          rules={editingUser ? [] : [{ required: true, min: 8, message: "Min 8 chars" }]}
        >
          <Input.Password placeholder={editingUser ? "Leave blank to keep current" : "Set a password"} />
        </Form.Item>
      </Form>
      </Modal>
    </div>
  );
}
