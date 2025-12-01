"use client";

import { GlobalOutlined, InfoCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Form, Input, InputNumber, Popover, Row, Select, Space, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";

const fallbackTimezones = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

function withInfo(label: string, content: string) {
  return (
    <Space size={6}>
      <span>{label}</span>
      <Popover content={content} trigger="hover">
        <InfoCircleOutlined className="text-gray-400" />
      </Popover>
    </Space>
  );
}

type OrgSettings = {
  defaultTimezone?: string | null;
  workdayStartMinutes?: number | null;
  workdayEndMinutes?: number | null;
  requiredDailyMinutes?: number | null;
  halfDayThresholdMinutes?: number | null;
  paidLunchMinutes?: number | null;
  lunchWindowStartMinutes?: number | null;
  lunchWindowEndMinutes?: number | null;
  allowExternalBreaks?: boolean | null;
  graceLateMinutes?: number | null;
  graceEarlyMinutes?: number | null;
  screenshotIntervalMinutes?: number | null;
  screenshotRetentionDays?: number | null;
  screenshotMonitoredRoles: string[];
  screenshotPolicyLocked?: boolean | null;
};

export default function OrgSettingsPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detectingTz, setDetectingTz] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const values = Form.useWatch([], form);
  const [screenshotLocked, setScreenshotLocked] = useState(false);

  const timeToString = (value?: number | null) => {
    if (value === null || value === undefined) return "";
    const h = Math.floor(value / 60)
      .toString()
      .padStart(2, "0");
    const m = (value % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const minutesLabel = (value?: number | null) => {
    if (value === null || value === undefined) return "";
    const h = Math.floor(value / 60)
      .toString()
      .padStart(2, "0");
    const m = (value % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const stringToMinutes = (value?: string) => {
    if (!value) return undefined;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return undefined;
    return hours * 60 + minutes;
  };

  const requiredTimeRule = {
    required: true,
    pattern: /^(\d{1,2}):(\d{2})$/,
    message: "Use HH:MM (24h)",
  };

  const workdayStartWatch = Form.useWatch("workdayStart", form);
  const workdayEndWatch = Form.useWatch("workdayEnd", form);
  const requiredMinutesWatch = Form.useWatch("requiredDailyMinutes", form);
  const halfDayMinutesWatch = Form.useWatch("halfDayThresholdMinutes", form);
  const lunchStartWatch = Form.useWatch("lunchWindowStart", form);
  const lunchEndWatch = Form.useWatch("lunchWindowEnd", form);

  const timezoneOptions = useMemo(() => {
    const values =
      typeof Intl !== "undefined" &&
      "supportedValuesOf" in Intl &&
      typeof Intl.supportedValuesOf === "function"
        ? (Intl.supportedValuesOf("timeZone") as string[])
        : fallbackTimezones;
    return values.map((tz) => ({ label: tz.replace("_", " "), value: tz }));
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
        const org: OrgSettings = data.org;
        form.setFieldsValue({
          timezone: org.defaultTimezone ?? undefined,
          workdayStart: timeToString(org.workdayStartMinutes ?? 540),
          workdayEnd: timeToString(org.workdayEndMinutes ?? 1080),
          requiredDailyMinutes: org.requiredDailyMinutes ?? 480,
          halfDayThresholdMinutes: org.halfDayThresholdMinutes ?? 240,
          paidLunchMinutes: org.paidLunchMinutes ?? 60,
          lunchWindowStart: timeToString(org.lunchWindowStartMinutes ?? 720),
          lunchWindowEnd: timeToString(org.lunchWindowEndMinutes ?? 840),
          allowExternalBreaks: org.allowExternalBreaks ?? true,
          graceLateMinutes: org.graceLateMinutes ?? 10,
          graceEarlyMinutes: org.graceEarlyMinutes ?? 0,
          screenshotIntervalMinutes: org.screenshotIntervalMinutes ?? 10,
          screenshotRetentionDays: org.screenshotRetentionDays ?? 30,
          screenshotMonitoredRoles: org.screenshotMonitoredRoles ?? [],
          screenshotPolicyLocked: org.screenshotPolicyLocked ?? false,
        });
        setScreenshotLocked(org.screenshotPolicyLocked ?? false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unable to load settings";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [form]);

  useEffect(() => {
    const start = stringToMinutes(workdayStartWatch);
    const end = stringToMinutes(workdayEndWatch);
    if (start === undefined || end === undefined) return;
    if (end <= start) return;
    const diff = end - start;
    form.setFieldsValue({
      requiredDailyMinutes: diff,
    });
  }, [form, workdayEndWatch, workdayStartWatch]);

  useEffect(() => {
    const start = stringToMinutes(lunchStartWatch);
    const end = stringToMinutes(lunchEndWatch);
    if (start === undefined || end === undefined) return;
    if (end <= start) return;
    const diff = end - start;
    form.setFieldsValue({ paidLunchMinutes: diff });
  }, [form, lunchEndWatch, lunchStartWatch]);

  const durationLabel = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const padded = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    return `${padded} (${minutes}m)`;
  };

  const handleDetectTimezone = async () => {
    setDetectingTz(true);
    try {
      const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (guess) {
        form.setFieldsValue({ timezone: guess });
        messageApi.success(`Detected timezone: ${guess}`);
        return;
      }
      const res = await fetch("https://worldtimeapi.org/api/ip");
      if (res.ok) {
        const data = await res.json();
        if (data?.timezone) {
          form.setFieldsValue({ timezone: data.timezone });
          messageApi.success(`Detected timezone from IP: ${data.timezone}`);
          return;
        }
      }
      messageApi.warning("Could not detect timezone. Please select manually.");
    } catch {
      messageApi.warning("Could not detect timezone. Please select manually.");
    } finally {
      setDetectingTz(false);
    }
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      const roles = values.screenshotMonitoredRoles ?? [];
      const normalizedRoles = roles.includes("ALL")
        ? ["EMPLOYEE", "MANAGER", "ORG_ADMIN"]
        : roles;
      setSaving(true);
      const body: Record<string, unknown> = {
        timezone: values.timezone,
        workdayStartMinutes: stringToMinutes(values.workdayStart),
        workdayEndMinutes: stringToMinutes(values.workdayEnd),
        requiredDailyMinutes: values.requiredDailyMinutes,
        halfDayThresholdMinutes: values.halfDayThresholdMinutes,
        paidLunchMinutes: values.paidLunchMinutes,
        lunchWindowStartMinutes: stringToMinutes(values.lunchWindowStart),
        lunchWindowEndMinutes: stringToMinutes(values.lunchWindowEnd),
        allowExternalBreaks: values.allowExternalBreaks,
        graceLateMinutes: values.graceLateMinutes,
        graceEarlyMinutes: values.graceEarlyMinutes,
        screenshotMonitoredRoles: normalizedRoles,
      };

      if (!screenshotLocked) {
        body.screenshotIntervalMinutes = values.screenshotIntervalMinutes;
        body.screenshotRetentionDays = values.screenshotRetentionDays;
      }

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      messageApi.success("Settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save settings";
      messageApi.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        Organisation settings
      </Typography.Title>
      <Typography.Text type="secondary">
        Configure working hours, grace, breaks, lunch, and screenshot policy for this org.
      </Typography.Text>
      {screenshotLocked ? (
        <Alert
          className="!my-2"
          type="warning"
          showIcon
          message="Screenshot interval and retention are locked by superadmin."
          description="You can edit who is monitored and other settings, but interval/retention are enforced centrally."
        />
      ) : null}
      {error ? (
        <Alert type="error" message="Unable to load settings" description={error} />
      ) : null}
      <Card loading={loading}>
        <Form layout="vertical" form={form}>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item
                name="timezone"
                label="Timezone"
                rules={[{ required: true, message: "Timezone required" }]}
              >
                <Select
                  showSearch
                  allowClear
                  options={timezoneOptions}
                  placeholder="Search timezone (e.g. Asia/Kolkata)"
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label=" ">
                <Button icon={<GlobalOutlined />} block onClick={handleDetectTimezone} loading={detectingTz}>
                  Detect timezone
                </Button>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="workdayStart"
                label={withInfo("Workday start", "HH:MM (24h) required")}
                rules={[requiredTimeRule]}
              >
                <Input placeholder="09:00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="workdayEnd"
                label={withInfo("Workday end", "HH:MM (24h) required")}
                rules={[requiredTimeRule]}
              >
                <Input placeholder="18:00" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="requiredDailyMinutes"
                label={withInfo("Required daily time", "Auto from start/end; adjust times to change")}
                rules={[{ required: true }]}
              >
                <InputNumber
                  className="w-full"
                  min={0}
                  max={1440}
                  step={30}
                  addonAfter={minutesLabel(requiredMinutesWatch) || "HH:MM"}
                />
              </Form.Item>
              <Typography.Text type="secondary">
                Auto: {durationLabel(requiredMinutesWatch)}. Change start/end to update.
              </Typography.Text>
            </Col>
            <Col span={12}>
              <Form.Item
                name="halfDayThresholdMinutes"
                label={withInfo("Half-day threshold", "Default 50% of required; adjust if needed")}
              >
                <InputNumber
                  className="w-full"
                  min={0}
                  max={1440}
                  step={30}
                  addonAfter={minutesLabel(halfDayMinutesWatch) || "HH:MM"}
                />
              </Form.Item>
              <Typography.Text type="secondary">
                Default: {durationLabel(Math.floor((requiredMinutesWatch ?? 0) / 2))}. Override if your policy differs.
              </Typography.Text>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="paidLunchMinutes"
                label={withInfo("Paid lunch minutes", "Paid lunch duration")}
              >
                <InputNumber className="w-full" min={0} max={240} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="allowExternalBreaks"
                label={withInfo("Allow external breaks", "If true, external breaks are allowed and deducted.")}
                initialValue={true}
              >
                <Select
                  options={[
                    { value: true, label: "Allowed" },
                    { value: false, label: "Not allowed" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="lunchWindowStart"
                label={withInfo("Lunch window start", "HH:MM (optional)")}
                rules={[{ pattern: /^(\d{1,2}):(\d{2})$/, message: "Use HH:MM or leave blank" }]}
              >
                <Input placeholder="12:00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="lunchWindowEnd"
                label={withInfo("Lunch window end", "HH:MM (optional)")}
                rules={[{ pattern: /^(\d{1,2}):(\d{2})$/, message: "Use HH:MM or leave blank" }]}
              >
                <Input placeholder="13:00" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="graceLateMinutes"
                label={withInfo("Grace late minutes", "Grace before marking late")}
              >
                <InputNumber className="w-full" min={0} max={120} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="graceEarlyMinutes"
                label={withInfo("Grace early minutes", "Grace before marking early leave")}
              >
                <InputNumber className="w-full" min={0} max={120} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="screenshotIntervalMinutes"
                label={withInfo("Screenshot interval (minutes)", "Capture frequency for monitored roles")}
                tooltip={screenshotLocked ? "Set by superadmin" : undefined}
              >
                <InputNumber
                  className="w-full"
                  min={1}
                  max={120}
                  disabled={screenshotLocked}
                  readOnly={screenshotLocked}
                  style={screenshotLocked ? { pointerEvents: "none" } : undefined}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="screenshotRetentionDays"
                label={withInfo("Screenshot retention (days)", "How long to keep screenshots before cleanup")}
                tooltip={screenshotLocked ? "Set by superadmin" : undefined}
              >
                <InputNumber
                  className="w-full"
                  min={1}
                  max={365}
                  disabled={screenshotLocked}
                  readOnly={screenshotLocked}
                  style={screenshotLocked ? { pointerEvents: "none" } : undefined}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="screenshotMonitoredRoles"
            label={withInfo("Roles monitored for screenshots", "Choose which roles are eligible for screenshot capture.")}
          >
            <Select
              mode="multiple"
              placeholder="Select roles"
              options={[
                { value: "ALL", label: "All roles (employees, managers, org admins)" },
                { value: "EMPLOYEE", label: "Employees" },
                { value: "MANAGER", label: "Managers" },
                { value: "ORG_ADMIN", label: "Org admins" },
              ]}
            />
          </Form.Item>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            loading={saving}
          >
            Save settings
          </Button>
        </Form>
      </Card>
    </div>
  );
}
