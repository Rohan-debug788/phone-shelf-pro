import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordAuthEvent } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Change password — Shop Stock" },
      { name: "description", content: "Set a new password for your shop stock account." },
      { property: "og:title", content: "Change password — Shop Stock" },
      { property: "og:description", content: "Set a new password for your shop stock account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: ChangePassword,
});

function ChangePassword() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logEvent = useServerFn(recordAuthEvent);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("The new passwords do not match");
      return;
    }
    if (next.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: next,
        ...(current ? { current_password: current } : {}),
      } as { password: string });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase.from("profiles").update({ must_change_password: false }).eq("id", data.user.id);
        await logEvent({ data: { event: "password_changed" } });
      }
      await queryClient.invalidateQueries();
      toast.success("Password updated");
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <form onSubmit={submit} className="panel w-full max-w-md space-y-4 p-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Change your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a password only you know before using the app.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="current">Current password</Label>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next">New password</Label>
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
