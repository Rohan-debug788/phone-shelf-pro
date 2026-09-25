import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signInWithPassword, requestPasswordReset } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Shop Stock" },
      { name: "description", content: "Sign in to your phone shop inventory and stock management account." },
      { property: "og:title", content: "Sign in — Shop Stock" },
      { property: "og:description", content: "Staff sign-in for the phone shop stock system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const signIn = useServerFn(signInWithPassword);
  const sendReset = useServerFn(requestPasswordReset);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !cancelled) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await signIn({ data: { email, password } });
      if (!res.ok) {
        toast.error(
          res.reason === "locked"
            ? "Too many failed attempts. Please wait 15 minutes and try again."
            : "Invalid email or password",
        );
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (error) {
        toast.error("Invalid email or password");
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await sendReset({ data: { email, origin: window.location.origin } });
      toast.success("If that email is registered, a reset link has been sent.");
      setMode("login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="panel w-full max-w-md p-8">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Shop Stock</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          {mode === "forgot" ? "Reset your password" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot"
              ? "We'll email you a link if the account exists and its email is verified."
              : "Accounts are created by the shop owner."}
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={mode === "forgot" ? handleForgot : handleLogin}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </Button>
        </form>

        {(
          <button
            className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setMode(mode === "forgot" ? "login" : "forgot")}
          >
            {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
          </button>
        )}
      </div>
    </div>
  );
}
