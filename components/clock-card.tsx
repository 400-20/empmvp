"use client";

import {
  CoffeeOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Card, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

export type ClockAttendance = {
  clockIn?: string | null;
  clockOut?: string | null;
  breaks?: { id: string; type: "LUNCH" | "EXTERNAL"; start: string; end?: string | null }[];
};

type Props = {
  attendance: ClockAttendance | null;
  pendingAction: string | null;
  onAction: (action: "clock-in" | "clock-out" | "break-in" | "break-out", breakType?: "LUNCH" | "EXTERNAL") => void;
  title?: string;
};

export function ClockCard({ attendance, pendingAction, onAction, title = "Your shift" }: Props) {
  const [timer, setTimer] = useState("00:00:00");

  const openLunch = useMemo(
    () => (attendance?.breaks ?? []).find((b) => b.type === "LUNCH" && !b.end),
    [attendance],
  );
  const openExternal = useMemo(
    () => (attendance?.breaks ?? []).find((b) => b.type === "EXTERNAL" && !b.end),
    [attendance],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const breaks = attendance?.breaks ?? [];
      const activeBreak = breaks.find((b) => !b.end);
      if (activeBreak) {
        const diff = dayjs().diff(dayjs(activeBreak.start), "second");
        setTimer(formatSeconds(diff));
      } else if (attendance?.clockIn && !attendance.clockOut) {
        const diff = dayjs().diff(dayjs(attendance.clockIn), "second");
        setTimer(formatSeconds(diff));
      } else {
        setTimer("00:00:00");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [attendance]);

  const statusTag = useMemo(() => {
    if (!attendance?.clockIn) return <Tag color="default">Not started</Tag>;
    if (attendance.clockIn && !attendance.clockOut) return <Tag color="cyan">On the clock</Tag>;
    if (attendance.clockIn && attendance.clockOut) return <Tag color="green">Completed</Tag>;
    return null;
  }, [attendance]);

  const hasClockIn = !!attendance?.clockIn;
  const hasClockOut = !!attendance?.clockOut;

  return (
    <Card
      className="brand-card"
      style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)" }}
      bodyStyle={{ color: "white" }}
    >
      <Space direction="vertical" size={10} className="w-full">
        <Space align="center" size={12} className="w-full justify-between">
          <div className="flex items-center gap-2">
            <ThunderboltOutlined />
            <Typography.Title level={4} style={{ margin: 0, color: "white" }}>
              {title}
            </Typography.Title>
          </div>
          {statusTag}
        </Space>

        <Space align="center" size={16}>
          <Typography.Text style={{ color: "white", fontSize: 24, fontWeight: 800 }}>{timer}</Typography.Text>
          <Typography.Text style={{ color: "white", opacity: 0.8 }}>
            {hasClockIn && !hasClockOut ? "Live timer" : "Awaiting start"}
          </Typography.Text>
        </Space>

        <Space wrap>
          <Button
            type="primary"
            icon={pendingAction === "clock-in" ? <LoadingOutlined /> : <PlayCircleOutlined />}
            onClick={() => onAction("clock-in")}
            loading={pendingAction === "clock-in"}
            disabled={hasClockIn && !hasClockOut}
            style={{ boxShadow: "0 10px 20px rgba(255,255,255,0.15)" }}
          >
            Clock in
          </Button>
          <Button
            type="primary"
            icon={pendingAction === "clock-out" ? <LoadingOutlined /> : <StopOutlined />}
            onClick={() => onAction("clock-out")}
            loading={pendingAction === "clock-out"}
            disabled={!hasClockIn || hasClockOut}
            danger
            style={{ background: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.35)" }}
          >
            Clock out
          </Button>
        </Space>

        <Space wrap>
          <Button
            type="default"
            ghost
            icon={<CoffeeOutlined />}
            onClick={() => onAction("break-in", "LUNCH")}
            loading={pendingAction === "break-in" && !!openLunch}
            disabled={!!openLunch || !hasClockIn || hasClockOut}
            style={{ color: "white", borderColor: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
          >
            Lunch break in
          </Button>
          <Button
            type="default"
            ghost
            icon={<CoffeeOutlined />}
            onClick={() => onAction("break-out", "LUNCH")}
            loading={pendingAction === "break-out" && !!openLunch}
            disabled={!openLunch}
            style={{ color: "white", borderColor: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
          >
            Lunch break out
          </Button>
          <Button
            type="default"
            ghost
            icon={<PauseCircleOutlined />}
            onClick={() => onAction("break-in", "EXTERNAL")}
            loading={pendingAction === "break-in" && !!openExternal}
            disabled={!!openExternal || !hasClockIn || hasClockOut}
            style={{ color: "white", borderColor: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
          >
            External break in
          </Button>
          <Button
            type="default"
            ghost
            icon={<PauseCircleOutlined />}
            onClick={() => onAction("break-out", "EXTERNAL")}
            loading={pendingAction === "break-out" && !!openExternal}
            disabled={!openExternal}
            style={{ color: "white", borderColor: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
          >
            External break out
          </Button>
        </Space>

        <div className="text-sm text-white/80 space-y-1">
          <div>
            In: {attendance?.clockIn ? dayjs(attendance.clockIn).format("HH:mm:ss") : "--"} | Out:{" "}
            {attendance?.clockOut ? dayjs(attendance.clockOut).format("HH:mm:ss") : "--"}
          </div>
          <div className="flex flex-wrap gap-3">
            <span>Lunch: {openLunch ? `started ${dayjs(openLunch.start).format("HH:mm")}` : "not active"}</span>
            <span>External: {openExternal ? `started ${dayjs(openExternal.start).format("HH:mm")}` : "not active"}</span>
          </div>
        </div>
      </Space>
    </Card>
  );
}

function formatSeconds(totalSec: number) {
  const h = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSec % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
}
