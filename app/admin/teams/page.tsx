"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";

type TeamRow = {
  id: string;
  name: string;
  managerId?: string | null;
  manager?: { id: string; name?: string | null; email: string } | null;
  members: { id: string; name?: string | null; email: string; role: string }[];
};

type UserOption = { value: string; label: string };

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamRes, userRes] = await Promise.all([
        fetch("/api/admin/teams", { cache: "no-store" }),
        fetch("/api/admin/users", { cache: "no-store" }),
      ]);
      const teamJson = await teamRes.json();
      const userJson = await userRes.json();
      if (!teamRes.ok) throw new Error(teamJson.error ?? "Failed to load teams");
      if (!userRes.ok) throw new Error(userJson.error ?? "Failed to load users");
      setTeams(teamJson.teams ?? []);
      const options: UserOption[] = (userJson.users ?? []).map((u: any) => ({
        value: u.id,
        label: u.name ? `${u.name} (${u.email})` : u.email,
      }));
      setUsers(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to load teams";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (team: TeamRow) => {
    setEditing(team);
    form.setFieldsValue({
      name: team.name,
      managerId: team.managerId ?? undefined,
      memberIds: team.members.map((m) => m.id),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editing) {
        const res = await fetch("/api/admin/teams", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            name: values.name,
            managerId: values.managerId ?? null,
            memberIds: values.memberIds ?? [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to update team");
        messageApi.success("Team updated");
      } else {
        const res = await fetch("/api/admin/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            managerId: values.managerId ?? undefined,
            memberIds: values.memberIds ?? [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create team");
        messageApi.success("Team created");
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save team";
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (team: TeamRow) => {
    Modal.confirm({
      title: `Delete ${team.name}?`,
      content: "This will remove the team and its member links.",
      okButtonProps: { danger: true },
      onOk: async () => {
        setSubmitting(true);
        try {
          const res = await fetch("/api/admin/teams", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: team.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to delete team");
          messageApi.success("Team deleted");
          fetchData();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unable to delete team";
          messageApi.error(msg);
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const columns: ColumnsType<TeamRow> = useMemo(
    () => [
      { title: "Name", dataIndex: "name" },
      {
        title: "Manager",
        dataIndex: "manager",
        render: (_v, r) => r.manager?.name || r.manager?.email || "—",
      },
      {
        title: "Members",
        dataIndex: "members",
        render: (members: TeamRow["members"]) =>
          members.length === 0 ? "—" : members.map((m) => m.name || m.email).join(", "),
      },
      {
        title: "Actions",
        key: "actions",
        render: (_v, record) => (
          <Space>
            <Button size="small" onClick={() => openEdit(record)}>
              Edit
            </Button>
            <Button size="small" danger onClick={() => handleDelete(record)} loading={submitting}>
              Delete
            </Button>
          </Space>
        ),
      },
    ],
    [submitting],
  );

  return (
    <div className="space-y-4">
      {contextHolder}
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            Teams
          </Typography.Title>
          <Typography.Text type="secondary">Organize members under managers.</Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New team
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" message={error} /> : null}

      <Card>
        <Table rowKey="id" columns={columns} dataSource={teams} loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title={editing ? "Edit team" : "Create team"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editing ? "Save" : "Create"}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="name" label="Team name" rules={[{ required: true, message: "Name required" }]}>
            <Input placeholder="Team name" />
          </Form.Item>
          <Form.Item name="managerId" label="Manager">
            <Select
              allowClear
              showSearch
              placeholder="Select manager"
              options={users}
              filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="memberIds" label="Members">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select members"
              options={users}
              filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
