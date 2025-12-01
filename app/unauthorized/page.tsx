"use client";

import { Result, Button } from "antd";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <Result
        status="403"
        title="Access denied"
        subTitle="You do not have permission to view this page."
        extra={
          <div className="flex gap-3">
            <Link href="/login">
              <Button type="primary">Go to login</Button>
            </Link>
            <Link href="/">
              <Button>Back home</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
