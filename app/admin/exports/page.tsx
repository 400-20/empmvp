"use client";

import { Alert, Button, Card, DatePicker, Space, Typography, message } from "antd";
import { Dayjs } from "dayjs";
import { useState } from "react";

export default function AdminExportsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [error, setError] = useState<string | null>(null);
  const startDate = range?.[0]?.format("YYYY-MM-DD");
  const endDate = range?.[1]?.format("YYYY-MM-DD");

  const download = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Download failed");
      const blob = new Blob([text], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      messageApi.success("Export ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to export";
      setError(msg);
      messageApi.error(msg);
    }
  };

  const withRangeParams = (base: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return `${base}?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Exports
      </Typography.Title>
      <Typography.Text type="secondary">Download attendance, leave, and payroll CSVs.</Typography.Text>
      {error ? <Alert type="error" message={error} /> : null}

      <Card className="brand-card">
        <Space direction="vertical" size={10} className="w-full">
          <DatePicker.RangePicker
            value={range}
            onChange={(vals) => setRange(vals as [Dayjs, Dayjs] | null)}
            placeholder={["Start", "End"]}
          />
          <Space wrap>
            <Button type="primary" onClick={() => download(withRangeParams("/api/admin/attendance?format=csv"), "attendance.csv")}>
              Attendance CSV
            </Button>
            <Button type="default" onClick={() => download(withRangeParams("/api/admin/exports/leave"), "leave.csv")}>
              Leave CSV
            </Button>
            <Button type="default" onClick={() => download(withRangeParams("/api/admin/exports/payroll"), "payroll.csv")}>
              Payroll CSV
            </Button>
          </Space>
          <Typography.Text type="secondary">
            Tip: set a date range before exporting. Attendance export respects filters; payroll export aggregates within range.
          </Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
