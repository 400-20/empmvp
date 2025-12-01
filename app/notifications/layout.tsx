"use client";

import { BellOutlined, LogoutOutlined } from "@ant-design/icons";
import { Badge, Button, Layout, Typography } from "antd";
import { signOut, useSession } from "next-auth/react";
import { ReactNode, useEffect, useState } from "react";

const { Header, Content } = Layout;

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setNotifCount((data.notifications ?? []).length);
      } catch {
        setNotifCount(0);
      }
    };
    load();
  }, []);

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center justify-between px-4" style={{ background: "linear-gradient(135deg, #0f172a 0%, #0ea5e9 100%)" }}>
        <Typography.Title level={4} style={{ margin: 0, color: "white" }}>
          Notifications
        </Typography.Title>
        <div className="flex items-center gap-3">
          <Badge count={notifCount} size="small">
            <BellOutlined style={{ color: "white", fontSize: 18 }} />
          </Badge>
          <Typography.Text style={{ color: "rgba(255,255,255,0.7)" }}>
            {session?.user?.email ?? ""}
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </Button>
        </div>
      </Header>
      <Content className="p-6 page-shell">{children}</Content>
    </Layout>
  );
}
