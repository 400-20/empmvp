import { cn } from "@/lib/utils";
import { Building2, Lock, Mail, RefreshCcw } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type LoginFormValues = {
  email: string;
  password: string;
  orgId?: string;
  remember?: boolean;
};

type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  initialEmail?: string;
  initialOrgId?: string;
};

const fallbackImage =
  "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80";

export default function LoginForm({
  onSubmit,
  loading,
  error,
  initialEmail,
  initialOrgId,
}: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState(initialOrgId ?? "");
  const [remember, setRemember] = useState(false);

  const heroImage = useMemo(() => fallbackImage, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      email,
      password,
      orgId: orgId?.trim() ? orgId.trim() : undefined,
      remember,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-indigo-50 to-white px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sky-100 md:grid-cols-2">
        <div className="relative hidden h-full min-h-[500px] md:block">
          <img
            src={heroImage}
            alt="Workspace"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#0ea5e9]/80 via-[#6366f1]/70 to-[#0f172a]/70 mix-blend-multiply" />
          <div className="absolute inset-0 flex flex-col justify-between p-8 text-white">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                EmpMVP
              </span>
              <span className="text-sm text-white/80">Multi-tenant HRMS</span>
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight">Workforce, time, and screenshots in one place.</h2>
              <p className="text-sm text-white/80">
                Clock-ins, breaks, leave, and screenshot policy are all enforced per organisation. Sign in to manage
                your teams with confidence.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-10">
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-md flex-col gap-4"
          >
            <div className="space-y-1 text-center md:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-500">Welcome back</p>
              <h1 className="text-3xl font-semibold text-slate-900">Sign in to continue</h1>
              <p className="text-sm text-slate-500">Use your org credentials. Org ID is optional unless required.</p>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <label className="relative flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus-within:ring-2 focus-within:ring-sky-200">
              <Mail className="h-4 w-4 text-slate-500" aria-hidden />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </label>

            <label className="relative flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus-within:ring-2 focus-within:ring-sky-200">
              <Lock className="h-4 w-4 text-slate-500" aria-hidden />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </label>

            <label className="relative flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus-within:ring-2 focus-within:ring-sky-200">
              <Building2 className="h-4 w-4 text-slate-500" aria-hidden />
              <input
                type="text"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="Org ID (optional)"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </label>

            {/* <div className="flex items-center justify-between text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                />
                <span>Remember me</span>
              </label>
              <a className="text-sky-600 hover:underline" href="#">
                Forgot password?
              </a>
            </div> */}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "group relative mt-2 inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-600 px-6 text-sm font-semibold !text-white shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-sky-300 ",
                loading && "opacity-70",
              )}
            >
              <span className="absolute inset-0 opacity-0 transition group-hover:opacity-10 bg-white" />
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>

            <p className="text-center text-xs text-slate-500">
              Need an account? Contact your Org Admin to be invited.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
