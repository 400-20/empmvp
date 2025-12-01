"use client";

import { SessionProvider } from "next-auth/react";
import { ConfigProvider, theme } from "antd";
import { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: "#0ea5e9",
            colorInfo: "#6366f1",
            colorSuccess: "#10b981",
            colorWarning: "#f59e0b",
            colorError: "#ef4444",
            borderRadius: 12,
            controlHeight: 42,
            fontSize: 14,
          },
          components: {
            Layout: {
              headerBg: "#0f172a",
              bodyBg: "transparent",
            },
            Card: {
              borderRadius: 16,
              boxShadow: "0 14px 38px rgba(15,23,42,0.12)",
            },
            Button: {
              borderRadius: 10,
              controlHeight: 40,
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </SessionProvider>
  );
}
