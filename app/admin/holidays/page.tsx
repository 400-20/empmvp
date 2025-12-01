"use client";

import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Radio, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

type Holiday = {
  id: string;
  date: string;
  label: string;
  isFullDay: boolean;
};

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<{ date: dayjs.Dayjs; label: string; isFullDay: boolean }>();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/holidays", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load holidays");
      setHolidays(data.holidays ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load holidays";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: values.date.format("YYYY-MM-DD"),
          label: values.label,
          isFullDay: values.isFullDay,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add holiday");
      messageApi.success("Holiday added");
      setModalOpen(false);
      fetchHolidays();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to add holiday";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = useCallback(
    (id: string) => {
      Modal.confirm({
        title: "Delete holiday?",
        content: "This will remove the holiday from the calendar.",
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            const res = await fetch(`/api/admin/holidays?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to delete holiday");
            messageApi.success("Holiday deleted");
            fetchHolidays();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unable to delete holiday";
            messageApi.error(msg);
          }
        },
      });
    },
    [fetchHolidays, messageApi],
  );

  const columns: ColumnsType<Holiday> = useMemo(
    () => [
      {
        title: "Date",
        dataIndex: "date",
        render: (value: string) => dayjs(value).format("YYYY-MM-DD"),
      },
      { title: "Label", dataIndex: "label" },
      {
        title: "Type",
        dataIndex: "isFullDay",
        render: (isFullDay: boolean) => <Tag color={isFullDay ? "green" : "gold"}>{isFullDay ? "Full-day" : "Half-day"}</Tag>,
      },
      {
        title: "Actions",
        key: "actions",
        render: (_value, record) => (
          <Button
            icon={<DeleteOutlined />}
            danger
            size="small"
            onClick={() => handleDelete(record.id)}
          >
            Delete
          </Button>
        ),
      },
    ],
    [handleDelete],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Holidays
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage public holidays and special off days for this org.
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchHolidays} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Add holiday
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" message="Unable to load holidays" description={error} /> : null}

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={holidays}
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="Add holiday"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        okText="Add"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={form} initialValues={{ isFullDay: true }}>
          <Form.Item
            name="date"
            label="Date"
            rules={[{ required: true, message: "Date required" }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="label"
            label="Label"
            rules={[{ required: true, message: "Label required" }]}
          >
            <Input placeholder="Public holiday" />
          </Form.Item>
          <Form.Item name="isFullDay" label="Type">
            <Radio.Group>
              <Radio value={true}>Full-day</Radio>
              <Radio value={false}>Half-day</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
