"use client";

import { Alert, Button, Card, Form, InputNumber, Modal, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

type Balance = {
  id: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  balance: number;
  used: number;
  user: { id: string; name?: string | null; email: string };
  leaveType: { id: string; code: string; name: string };
};

type UserLite = { id: string; name?: string | null; email: string };
type LeaveTypeLite = { id: string; code: string; name: string };

export default function LeaveBalancesPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [types, setTypes] = useState<LeaveTypeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Balance | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const [form] = Form.useForm<{ userId: string; leaveTypeId: string; year: number; balance: number }>();
  const [messageApi, contextHolder] = message.useMessage();

  const yearOptions = useMemo(() => {
    const current = dayjs().year();
    return Array.from({ length: 5 }).map((_, i) => {
      const year = current - 1 + i;
      return { value: year, label: `${year}` };
    });
  }, []);

  const fetchAll = async (userId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = userId ? `?userId=${userId}` : "";
      const [balRes, userRes, typeRes] = await Promise.all([
        fetch(`/api/admin/leave-balances${params}`, { cache: "no-store" }),
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/leave-types", { cache: "no-store" }),
      ]);
      const [balJson, userJson, typeJson] = await Promise.all([balRes.json(), userRes.json(), typeRes.json()]);
      if (!balRes.ok) throw new Error(balJson.error ?? "Failed to load balances");
      if (!userRes.ok) throw new Error(userJson.error ?? "Failed to load users");
      if (!typeRes.ok) throw new Error(typeJson.error ?? "Failed to load leave types");
      setBalances(balJson.balances ?? []);
      setUsers(userJson.users ?? []);
      setTypes(typeJson.types ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load leave balances";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ year: dayjs().year(), balance: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: Balance) => {
    setEditing(record);
    form.setFieldsValue({
      userId: record.userId,
      leaveTypeId: record.leaveTypeId,
      year: record.year,
      balance: record.balance,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await fetch("/api/admin/leave-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save balance");
      messageApi.success("Leave balance saved");
      setModalOpen(false);
      fetchAll(filterUser ?? undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save balance";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBalances = useMemo(() => {
    if (!filterUser) return balances;
    return balances.filter((b) => b.userId === filterUser);
  }, [balances, filterUser]);

  const columns: ColumnsType<Balance> = [
    {
      title: "Employee",
      dataIndex: "user",
      render: (u) => u?.name || u?.email,
    },
    {
      title: "Leave type",
      dataIndex: "leaveType",
      render: (t) => `${t.code} (${t.name})`,
    },
    { title: "Year", dataIndex: "year" },
    { title: "Balance", dataIndex: "balance" },
    { title: "Used", dataIndex: "used" },
    {
      title: "Actions",
      key: "actions",
      render: (_v, record) => (
        <Button size="small" onClick={() => openEdit(record)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {contextHolder}
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Leave balances
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage per-employee annual leave quotas and usage.
          </Typography.Text>
        </div>
        <Space>
          <Select
            allowClear
            placeholder="Filter by user"
            style={{ minWidth: 220 }}
            value={filterUser ?? undefined}
            onChange={(v) => {
              setFilterUser(v ?? null);
              fetchAll(v ?? undefined);
            }}
            options={users.map((u) => ({ value: u.id, label: u.name || u.email }))}
          />
          <Button type="primary" onClick={openCreate}>
            New balance
          </Button>
        </Space>
      </div>
      {error ? <Alert type="error" message="Unable to load leave balances" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredBalances}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editing ? "Edit leave balance" : "New leave balance"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editing ? "Save" : "Create"}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={form} initialValues={{ year: dayjs().year(), balance: 0 }}>
          <Form.Item name="userId" label="Employee" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Select employee"
              options={users.map((u) => ({ value: u.id, label: u.name || u.email }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="leaveTypeId" label="Leave type" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Select leave type"
              options={types.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="year" label="Year" rules={[{ required: true }]}>
            <Select options={yearOptions} />
          </Form.Item>
          <Form.Item name="balance" label="Annual quota" rules={[{ required: true }]}>
            <InputNumber className="w-full" min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
