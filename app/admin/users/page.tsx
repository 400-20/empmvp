"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
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
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  managerId?: string | null;
  manager?: { id: string; name?: string | null; email: string };
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

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form] = Form.useForm<UserFormValues>();
  const [messageApi, contextHolder] = message.useMessage();

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
    form.setFieldsValue({ role: "EMPLOYEE" });
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
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag>{status}</Tag>,
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
          <Form.Item name="managerId" label="Manager (optional)">
            <Select
              allowClear
              placeholder="Select manager"
              options={managerOptions}
            />
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
