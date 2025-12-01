"use client";

import LoginForm from "@/components/ui/login-form";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginPayload = {
  email: string;
  password: string;
  orgId?: string;
  remember?: boolean;
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const roleHome: Record<string, string> = {
    SUPERADMIN: "/superadmin",
    ORG_ADMIN: "/admin",
    MANAGER: "/manager",
    EMPLOYEE: "/employee",
  };

  const handleSubmit = async (values: LoginPayload) => {
    setError(null);
    setLoading(true);

    const payload: Record<string, string | boolean | undefined> = {
      redirect: false,
      email: values.email,
      password: values.password,
      callbackUrl,
    };
    if (values.orgId) payload.orgId = values.orgId;

    const res = await signIn("credentials", payload);

    if (res?.error) {
      setError("Invalid credentials or inactive account.");
      setLoading(false);
      return;
    }

    const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
    const session = sessionRes.ok ? await sessionRes.json() : null;
    const role = session?.user?.role as string | undefined;
    const destination = callbackUrl || (role ? roleHome[role] : undefined) || "/";

    setLoading(false);

    if (destination === "/" && role && roleHome[role]) {
      router.push(roleHome[role]);
    } else {
      router.push(destination);
    }
  };

  return <LoginForm onSubmit={handleSubmit} loading={loading} error={error} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
