"use client";

import { BellOutlined, LogoutOutlined } from "@ant-design/icons";
import { Badge, Button, Dropdown, Layout, Menu, Typography } from "antd";
import { motion } from "framer-motion";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

const { Header, Content } = Layout;

const navItems = [
  { key: "/admin", label: "Dashboard" },
  { key: "/admin/settings", label: "Org settings" },
  { key: "/admin/attendance", label: "Attendance" },
  { key: "/admin/users", label: "Users" },
  { key: "/admin/holidays", label: "Holidays" },
  { key: "/admin/audit", label: "Audit log" },
  { key: "/admin/leave-types", label: "Leave types" },
  { key: "/admin/leave-balances", label: "Leave balances" },
  { key: "/admin/leave-requests", label: "Leave approvals" },
  { key: "/admin/corrections", label: "Corrections" },
  { key: "/admin/exports", label: "Exports" },
  { key: "/admin/screenshots", label: "Screenshots" },
  { key: "/notifications", label: "Notifications" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState<{ id: string; message: string; type: string }[]>([]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const loadNotifs = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) {
          setNotifs(data.notifications ?? []);
          setNotifCount((data.notifications ?? []).length);
        }
      } catch {
        setNotifCount(0);
      } finally {
        timer = setTimeout(loadNotifs, 30000);
      }
    };
    loadNotifs();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const activeKey =
    navItems.reduce<string | undefined>((acc, item) => {
      if (pathname?.startsWith(item.key) && item.key.length > (acc?.length ?? 0)) return item.key;
      return acc;
    }, undefined) ?? "/admin";

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center justify-between px-4" style={{ background: "linear-gradient(135deg, #0f172a 0%, #0ea5e9 100%)" }}>
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex items-center gap-3">
            <Typography.Title level={4} style={{ margin: 0, color: "white" }}>
              Org Admin
            </Typography.Title>
            <Typography.Text style={{ color: "rgba(255,255,255,0.7)" }}>
              {session?.user?.orgId ? `Org: ${session.user.orgId}` : "No org context"}
            </Typography.Text>
          </div>
        </motion.div>
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <Typography.Text style={{ color: "rgba(255,255,255,0.7)" }}>
            {session?.user?.email ?? "not signed in"} ({session?.user?.role})
          </Typography.Text>
          <Dropdown
            placement="bottomRight"
            menu={{
              items:
                notifs.length > 0
                  ? notifs.map((n) => ({
                      key: n.id,
                      label: n.message,
                    }))
                  : [{ key: "none", label: "No alerts" }],
            }}
          >
            <Badge count={notifCount} size="small">
              <Button type="text" icon={<BellOutlined />} />
            </Badge>
          </Dropdown>
          <Button icon={<LogoutOutlined />} onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </Button>
        </motion.div>
      </Header>
      <Layout>
        <div className="bg-white shadow-sm">
          <Menu
            mode="horizontal"
            selectedKeys={[activeKey]}
            items={navItems.map((item) => ({
              key: item.key,
              label: <Link href={item.key}>{item.label}</Link>,
            }))}
          />
        </div>
        <Content className="p-6">{children}</Content>
      </Layout>
    </Layout>
  );
}
