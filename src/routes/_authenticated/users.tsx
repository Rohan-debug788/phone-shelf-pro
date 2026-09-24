import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { profilesQuery } from "@/lib/queries";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createAgent, setUserActive, adminResetPassword, listVerification } from "@/lib/admin.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users — Shop Stock" },
      { name: "description", content: "Add sales agents, reset passwords and deactivate accounts." },
      { property: "og:title", content: "Users — Shop Stock" },
      { property: "og:description", content: "Manage staff accounts for the shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const { data: people = [] } = useQuery(profilesQuery);
  const listVer = useServerFn(listVerification);
  const { data: ver = [] } = useQuery({ queryKey: ["verification"], queryFn: () => listVer(), enabled: !!me?.isAdmin });
  const create = useServerFn(createAgent);
  const setActive = useServerFn(setUserActive);
  const reset = useServerFn(adminResetPassword);

  const [form, setForm] = useState({ name: "", email: "", employeeId: "", role: "agent" });
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  if (me && !me.isAdmin) return <p className="text-muted-foreground">Only administrators can manage users.</p>;
  const verified = new Map(ver.map((v) => [v.id, v.verified]));

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await create({ data: { ...form, role: form.role as "agent" | "admin" } });
      setSecret({ email: form.email, password: r.tempPassword });
      setForm({ name: "", email: "", employeeId: "", role: "agent" });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["verification"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    try {
      await setActive({ data: { userId: id, active } });
      toast.success(active ? "Account reactivated" : "Account deactivated");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function doReset(id: string, email: string) {
    if (!confirm(`Reset password for ${email}?`)) return;
    try {
      const r = await reset({ data: { userId: id } });
      setSecret({ email, password: r.tempPassword });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <>
      <PageHeader title="Users" description="Staff accounts. Accounts are never deleted — deactivate instead." />

      <form onSubmit={onCreate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
        <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label>Employee ID</Label><Input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></div>
        <div>
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Sales agent</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add user"}</Button>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className={cn("border-b border-border last:border-0", !p.is_active && "opacity-60")}>
                <td className="px-4 py-3 font-medium">{p.name}{p.employee_id && <span className="ml-2 text-xs text-muted-foreground">#{p.employee_id}</span>}</td>
                <td className="px-4 py-3">
                  {p.email}
                  <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", verified.get(p.id) ? "bg-success/15 text-success" : "bg-warning/15 text-warning-foreground")}>
                    {verified.get(p.id) ? "Verified" : "Unverified"}
                  </span>
                </td>
                <td className="px-4 py-3">{p.role === "admin" ? "Admin" : "Agent"}</td>
                <td className="px-4 py-3">{p.is_active ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {p.id !== me?.id && (
                    <>
                      <Button size="sm" variant="outline" className="mr-2" onClick={() => doReset(p.id, p.email)}>Reset password</Button>
                      <Button size="sm" variant={p.is_active ? "destructive" : "secondary"} onClick={() => toggle(p.id, !p.is_active)}>
                        {p.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>Give this to {secret?.email}. It is shown only once; they must change it at first sign-in.</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg bg-muted p-4 text-center font-mono text-lg select-all">{secret?.password}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
