"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { sanitizeNextPath } from "@/lib/navigation";

function LoginForm() {
  const { status, sessionError, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = sanitizeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath);
    }
  }, [status, nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Email wajib diisi.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setFormError("Kata sandi harus terdiri dari 8 sampai 128 karakter.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      await login({ email: trimmedEmail, password });
      router.replace(nextPath);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === "RATE_LIMIT_EXCEEDED" && error.retryAfterSeconds) {
          setFormError(
            `${error.message} Coba lagi dalam ${error.retryAfterSeconds} detik.`,
          );
        } else if (error.details && error.details.length > 0) {
          setFormError(error.details.map((d) => d.message).join(" "));
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("Terjadi kesalahan saat masuk. Silakan coba lagi.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
            aria-hidden="true"
          />
          <span>Memeriksa sesi aktif...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            IMS
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Masuk ke IMS
            </h1>
            <p className="text-xs text-slate-500">
              Single-Warehouse Inventory Management System
            </p>
          </div>
        </div>

        {sessionError ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {sessionError}
          </div>
        ) : null}

        {formError ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {formError}
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@perusahaan.com"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Kata Sandi
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan kata sandi"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center bg-slate-50 px-4">
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600 shadow-sm">
            Memuat halaman masuk...
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
