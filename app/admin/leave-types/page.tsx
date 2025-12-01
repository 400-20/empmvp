"use client";

import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";

type LeaveType = {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  defaultAnnualQuota?: number | null;
};

export default function LeaveTypesPage() {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<LeaveType>();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leave-types", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load leave types");
      setTypes(data.types ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load leave types";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const resetModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isPaid: true });
    setModalOpen(true);
  };

  const openEdit = (record: LeaveType) => {
    setEditing(record);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      isPaid: record.isPaid,
      defaultAnnualQuota: record.defaultAnnualQuota ?? null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        code: values.code,
        name: values.name,
        isPaid: values.isPaid,
        defaultAnnualQuota: values.defaultAnnualQuota ?? null,
      };
      const res = await fetch("/api/admin/leave-types", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${editing ? "update" : "create"} leave type`);
      messageApi.success(editing ? "Leave type updated" : "Leave type created");
      resetModal();
      fetchTypes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save leave type";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (record: LeaveType) => {
    Modal.confirm({
      title: `Delete ${record.name}?`,
      content: "This removes the leave type and its default quota. Existing balances/requests remain unchanged.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        setSubmitting(true);
        try {
          const res = await fetch("/api/admin/leave-types", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: record.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to delete leave type");
          messageApi.success("Leave type deleted");
          fetchTypes();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unable to delete leave type";
          messageApi.error(msg);
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const columns: ColumnsType<LeaveType> = [
    { title: "Code", dataIndex: "code" },
    { title: "Name", dataIndex: "name" },
    {
      title: "Paid?",
      dataIndex: "isPaid",
      render: (v) => <Tag color={v ? "green" : "red"}>{v ? "Paid" : "Unpaid"}</Tag>,
    },
    {
      title: "Default annual quota",
      dataIndex: "defaultAnnualQuota",
      render: (v) => (v ?? "—"),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_v, record) => (
        <div className="flex gap-2">
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Button size="small" danger onClick={() => handleDelete(record)} loading={submitting}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {contextHolder}
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Leave types
          </Typography.Title>
          <Typography.Text type="secondary">
            Configure leave categories and default quotas.
          </Typography.Text>
        </div>
        <Button type="primary" onClick={openCreate}>
          New leave type
        </Button>
      </div>
      {error ? <Alert type="error" message="Unable to load leave types" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={types}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editing ? "Edit leave type" : "Create leave type"}
        open={modalOpen}
        onCancel={resetModal}
        onOk={handleSubmit}
        okText={editing ? "Save" : "Create"}
        confirmLoading={submitting}
      >
        <Form layout="vertical" form={form} initialValues={{ isPaid: true }}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="PL" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Paid leave" />
          </Form.Item>
          <Form.Item name="isPaid" label="Type">
            <Radio.Group>
              <Radio value={true}>Paid</Radio>
              <Radio value={false}>Unpaid</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="defaultAnnualQuota" label="Default annual quota">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
