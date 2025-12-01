"use client";

import { BellOutlined, LogoutOutlined } from "@ant-design/icons";
import { Badge, Button, Dropdown, Layout, Menu, Typography } from "antd";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { motion } from "framer-motion";

const { Header, Content } = Layout;

const navItems = [
  { key: "/manager", label: "Team attendance" },
  { key: "/manager/leave", label: "Leave approvals" },
  { key: "/manager/corrections", label: "Corrections" },
  { key: "/manager/dwr", label: "Team DWR" },
  { key: "/notifications", label: "Notifications" },
];

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState<{ id: string; message: string; type: string }[]>([]);

  useEffect(() => {
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
      }
    };
    loadNotifs();
  }, []);

  const activeKey =
    navItems.reduce<string | undefined>((acc, item) => {
      if (pathname?.startsWith(item.key) && item.key.length > (acc?.length ?? 0)) return item.key;
      return acc;
    }, undefined) ?? "/manager";

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center justify-between px-4" style={{ background: "linear-gradient(135deg, #0f172a 0%, #0ea5e9 100%)" }}>
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex items-center gap-3">
            <Typography.Title level={4} style={{ margin: 0, color: "white" }}>
              Manager
            </Typography.Title>
            <Typography.Text style={{ color: "rgba(255,255,255,0.7)" }}>
              {session?.user?.email ?? ""} ({session?.user?.role})
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
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
          <Button icon={<LogoutOutlined />} onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </Button>
        </motion.div>
      </Header>
      <div className="bg-white shadow-sm">
        <Menu
          mode="horizontal"
          selectedKeys={[activeKey]}
          items={navItems.map((i) => ({ key: i.key, label: <Link href={i.key}>{i.label}</Link> }))}
        />
      </div>
      <Content className="p-6">{children}</Content>
    </Layout>
  );
}
