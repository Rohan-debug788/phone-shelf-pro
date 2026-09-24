import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { salesQuery, stockQuery, profilesQuery } from "@/lib/queries";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PageHeader } from "@/components/AppShell";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales registered — Shop Stock" },
      { name: "description", content: "Every phone sale recorded, by agent, date and model." },
      { property: "og:title", content: "Sales registered — Shop Stock" },
      { property: "og:description", content: "Recorded phone sales by agent, date and model." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const { data: me } = useCurrentUser();
  const { data: sales = [], isLoading } = useQuery(salesQuery);
  const { data: stock = [] } = useQuery(stockQuery);
  const { data: people = [] } = useQuery(profilesQuery);
  const [agent, setAgent] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const unitMap = useMemo(() => new Map(stock.map((u) => [u.id, u])), [stock]);
  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.is_active ? p.name : `${p.name} (inactive)`]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [people]);

  const rows = sales.filter((s) => {
    if (agent !== "all" && s.sold_by_id !== agent) return false;
    const d = s.created_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const u = unitMap.get(s.stock_unit_id);
      if (!u || !(u.imei.includes(q) || u.model.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title="Sales registered"
        description={me?.isAdmin ? `${rows.length} sales shown` : `Your sales — ${rows.length} shown`}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Input placeholder="IMEI or model" value={search} onChange={(e) => setSearch(e.target.value)} />
        {me?.isAdmin ? (
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.is_active ? p.name : `${p.name} (inactive)`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : <div className="hidden sm:block" />}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">IMEI</th>
              <th className="px-4 py-3">Sold by</th>
              <th className="px-4 py-3">Buyer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const u = unitMap.get(s.stock_unit_id);
              return (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                  <td className="px-4 py-3">{u ? `${u.model}${u.variant ? ` · ${u.variant}` : ""}` : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u?.imei ?? "—"}</td>
                  <td className="px-4 py-3">{nameOf(s.sold_by_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[s.buyer_name, s.buyer_phone].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No sales found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
