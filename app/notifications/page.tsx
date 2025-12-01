"use client";

import { Alert, Badge, Card, List, Space, Tag, Typography } from "antd";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  message: string;
  type: "info" | "warning" | "success";
};

const typeColor: Record<NotificationItem["type"], string> = {
  info: "blue",
  warning: "orange",
  success: "green",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load notifications");
        setItems(data.notifications ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load notifications";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-4">
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          Notifications
        </Typography.Title>
        <Typography.Text type="secondary">Alerts relevant to your role.</Typography.Text>
      </Space>
      {error ? <Alert type="error" message={error} /> : null}

      <Card className="brand-card" style={{ overflow: "hidden" }}>
        <AnimatePresence initial={false}>
          <List
            loading={loading}
            dataSource={items}
            locale={{ emptyText: "No notifications" }}
            renderItem={(item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <List.Item>
                  <Space>
                    <Tag color={typeColor[item.type]}>{item.type}</Tag>
                    <Typography.Text>{item.message}</Typography.Text>
                  </Space>
                </List.Item>
              </motion.div>
            )}
          />
        </AnimatePresence>
      </Card>
    </div>
  );
}
