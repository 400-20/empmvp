"use client";

import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

interface LoginFields {
  email: string;
  password: string;
  orgId?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roleHome: Record<string, string> = {
    SUPERADMIN: "/superadmin",
    ORG_ADMIN: "/admin",
    MANAGER: "/manager",
    EMPLOYEE: "/employee",
  };

  const onFinish = (values: LoginFields) => {
    setError(null);
    startTransition(async () => {
      const payload: Record<string, string | boolean | undefined> = {
        redirect: false,
        email: values.email,
        password: values.password,
        callbackUrl,
      };
      const trimmedOrgId = values.orgId?.trim();
      if (trimmedOrgId) {
        payload.orgId = trimmedOrgId;
      }

      const res = await signIn("credentials", payload);

      if (res?.error) {
        setError("Invalid credentials or inactive account.");
        return;
      }

      // Fetch session to route users to their home based on role.
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = sessionRes.ok ? await sessionRes.json() : null;
      const role = session?.user?.role as string | undefined;
      const destination = callbackUrl || (role ? roleHome[role] : undefined) || "/";

      // Prefer role-based home if callbackUrl is default "/".
      if (destination === "/" && role && roleHome[role]) {
        router.push(roleHome[role]);
      } else {
        router.push(destination);
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <div className="mb-6 text-center">
          <Typography.Title level={3} style={{ marginBottom: 8 }}>
            Sign in
          </Typography.Title>
          <Typography.Text type="secondary">
            Enter your credentials to access your dashboard.
          </Typography.Text>
        </div>

        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            className="mb-4"
          />
        ) : null}

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: "Email is required" }, { type: "email" }]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@example.com" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Password is required" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="********" />
          </Form.Item>

          <Form.Item
            label="Org ID (optional for multi-tenant login)"
            name="orgId"
          >
            <Input placeholder="Org UUID (if required)" />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={pending}
          >
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
