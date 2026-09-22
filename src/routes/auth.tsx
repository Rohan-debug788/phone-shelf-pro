import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminExists,
  bootstrapFirstAdmin,
  checkLoginAllowed,
  recordAuthEvent,
} from "@/lib/admin.functions";
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

type Mode = "login" | "forgot" | "setup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const checkAdmins = useServerFn(adminExists);
  const createFirstAdmin = useServerFn(bootstrapFirstAdmin);
  const canAttempt = useServerFn(checkLoginAllowed);
  const logEvent = useServerFn(recordAuthEvent);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !cancelled) navigate({ to: "/dashboard", replace: true });
    });
    checkAdmins().then((r) => {
      if (!cancelled && !r.exists) {
        setNeedsSetup(true);
        setMode("setup");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checkAdmins, navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { allowed } = await canAttempt({ data: { email } });
      if (!allowed) {
        toast.error("Too many failed attempts. Please wait 15 minutes and try again.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        await logEvent({ data: { email, event: "login_failed" } });
        toast.error("Invalid email or password");
        return;
      }
      await logEvent({ data: { email, event: "login_success" } });
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      await logEvent({ data: { email, event: "password_reset_requested" } });
      toast.success("If that email is registered, a reset link has been sent.");
      setMode("login");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createFirstAdmin({ data: { email, name, password } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.success("Administrator created. Please sign in.");
        setNeedsSetup(false);
        setMode("login");
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the administrator account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="panel w-full max-w-md p-8">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Shop Stock</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          {mode === "setup" ? "Create the owner account" : mode === "forgot" ? "Reset your password" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "setup"
            ? "This shop has no administrator yet. Create yours to get started."
            : mode === "forgot"
              ? "We'll email you a link if the account exists and its email is verified."
              : "Accounts are created by the shop owner."}
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={mode === "setup" ? handleSetup : mode === "forgot" ? handleForgot : handleLogin}
        >
          {mode === "setup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>
          )}
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
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "setup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </Button>
        </form>

        {!needsSetup && (
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
