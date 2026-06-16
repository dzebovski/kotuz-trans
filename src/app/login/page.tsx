"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, LockKeyhole, LogIn, Mail } from "lucide-react";
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
    <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Email
        <span className="input-with-icon">
          <Mail size={15} />
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </span>
      </label>

      <label>
        Пароль
        <span className="input-with-icon">
          <LockKeyhole size={15} />
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </span>
      </label>

      {error ? <div className="error-banner">{error}</div> : null}

      <button className="button button--primary" type="submit" disabled={loading}>
        <LogIn size={16} />
        {loading ? "Вхід..." : "Увійти"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="panel auth-card">
        <div className="brand-mark">
          <Database size={18} />
        </div>
        <h1>Fleet Analytics</h1>
        <p>Увійдіть, щоб переглянути подобові звіти флоту.</p>

        <Suspense fallback={<p className="muted">Завантаження...</p>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
