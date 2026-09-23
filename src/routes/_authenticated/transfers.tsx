import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { stockQuery, profilesQuery, transfersQuery } from "@/lib/queries";
import { PageHeader } from "@/components/AppShell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/transfers")({
  head: () => ({
    meta: [
      { title: "Stock transfer — Shop Stock" },
      { name: "description", content: "Assign phones to agents, reclaim them, and see who holds what." },
      { property: "og:title", content: "Stock transfer — Shop Stock" },
      { property: "og:description", content: "Assign and reclaim phone stock, with a full custody log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Transfers,
});

function Transfers() {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();
  const { data: stock = [] } = useQuery(stockQuery);
  const { data: people = [] } = useQuery(profilesQuery);
  const { data: log = [] } = useQuery(transfersQuery);

  const [assignTo, setAssignTo] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reclaim, setReclaim] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const agents = people.filter((p) => p.role === "agent" && p.is_active);
  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.is_active ? p.name : `${p.name} (inactive)`]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "Store");
  }, [people]);

  const inStore = stock.filter((u) => u.status === "in_store");
  const withAgents = stock.filter((u) => u.status === "with_agent");

  if (me && !me.isAdmin) {
    return <p className="text-sm text-muted-foreground">Only the shop owner can move stock.</p>;
  }

  async function move(ids: string[], toAgent: string | null) {
    if (!me || ids.length === 0) return;
    setBusy(true);
    try {
      const units = stock.filter((u) => ids.includes(u.id));
      const { error } = await supabase
        .from("stock_units")
        .update({
          status: toAgent ? "with_agent" : "in_store",
          current_holder_id: toAgent,
        })
        .in("id", ids);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.from("stock_transfers").insert(
        units.map((u) => ({
          stock_unit_id: u.id,
          from_status: u.status,
          to_status: (toAgent ? "with_agent" : "in_store") as "with_agent" | "in_store",
          from_holder_id: u.current_holder_id,
          to_holder_id: toAgent,
          performed_by_id: me.id,
        })),
      );
      await queryClient.invalidateQueries();
      setSelected({});
      setReclaim({});
      toast.success(
        toAgent ? `${ids.length} unit(s) assigned` : `${ids.length} unit(s) returned to store`,
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const reclaimIds = Object.keys(reclaim).filter((k) => reclaim[k]);

  const byAgent = agents.map((a) => ({
    agent: a,
    units: withAgents.filter((u) => u.current_holder_id === a.id),
  }));

  return (
    <>
      <PageHeader title="Stock transfer" description="Stock always passes back through the store." />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-base font-semibold">Assign to an agent</h2>
          <div className="mt-3 space-y-1.5">
            <Label>Agent</Label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
            {inStore.length === 0 && <p className="text-sm text-muted-foreground">No units in store.</p>}
            {inStore.map((u) => (
              <label key={u.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Checkbox
                  checked={!!selected[u.id]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [u.id]: Boolean(v) }))}
                />
                <span className="text-sm">
                  {u.model} {u.variant ? `· ${u.variant}` : ""}
                </span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{u.imei}</span>
              </label>
            ))}
          </div>

          <Button
            className="mt-4"
            disabled={busy || !assignTo || selectedIds.length === 0}
            onClick={() => move(selectedIds, assignTo)}
          >
            Assign {selectedIds.length || ""} unit(s)
          </Button>
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-base font-semibold">Return to store</h2>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {withAgents.length === 0 && <p className="text-sm text-muted-foreground">No units with agents.</p>}
            {withAgents.map((u) => (
              <label key={u.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Checkbox
                  checked={!!reclaim[u.id]}
                  onCheckedChange={(v) => setReclaim((s) => ({ ...s, [u.id]: Boolean(v) }))}
                />
                <span className="text-sm">
                  {u.model} · {nameOf(u.current_holder_id)}
                </span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{u.imei}</span>
              </label>
            ))}
          </div>
          <Button
            className="mt-4"
            variant="secondary"
            disabled={busy || reclaimIds.length === 0}
            onClick={() => move(reclaimIds, null)}
          >
            Return {reclaimIds.length || ""} unit(s)
          </Button>
        </section>
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="font-display text-base font-semibold">Who holds what</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {byAgent.map(({ agent, units }) => (
            <div key={agent.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{agent.name}</p>
              <p className="text-xs text-muted-foreground">{units.length} unit(s)</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {units.map((u) => (
                  <li key={u.id} className="font-mono">
                    {u.imei} · {u.model}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="panel mt-4 overflow-x-auto p-5">
        <h2 className="font-display text-base font-semibold">Transfer log</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2">When</th>
              <th className="py-2">Unit</th>
              <th className="py-2">From</th>
              <th className="py-2">To</th>
              <th className="py-2">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {log.slice(0, 50).map((t) => {
              const unit = stock.find((u) => u.id === t.stock_unit_id);
              return (
                <tr key={t.id}>
                  <td className="py-2 text-muted-foreground">{formatDateTime(t.created_at)}</td>
                  <td className="py-2 font-mono text-xs">{unit?.imei ?? "—"}</td>
                  <td className="py-2">{nameOf(t.from_holder_id)}</td>
                  <td className="py-2">{nameOf(t.to_holder_id)}</td>
                  <td className="py-2">{nameOf(t.performed_by_id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
