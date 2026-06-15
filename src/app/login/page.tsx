"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Невірний email або пароль.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Email не підтверджено. Перевірте пошту або зверніться до адміністратора.";
  }
  return "Не вдалося увійти. Спробуйте ще раз.";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(translateAuthError(signInError.message));
      setLoading(false);
      return;
    }

    router.replace(nextPath.startsWith("/") ? nextPath : "/");
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 6 }}>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={{ padding: "8px 10px" }}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        Пароль
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{ padding: "8px 10px" }}
        />
      </label>

      {error ? <p style={{ color: "#b00020", margin: 0 }}>{error}</p> : null}

      <button type="submit" disabled={loading} style={{ padding: "10px 12px" }}>
        {loading ? "Вхід…" : "Увійти"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "1.5rem",
        maxWidth: 420,
        margin: "4rem auto",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Fleet Analytics</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Увійдіть, щоб переглянути звіти</p>

      <Suspense fallback={<p>Завантаження…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
