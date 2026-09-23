import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { stockQuery, profilesQuery } from "@/lib/queries";
import { PageHeader, StatusPill } from "@/components/AppShell";
import { daysSince, ageTone, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Shop Stock" },
      { name: "description", content: "Every phone in the shop by IMEI, status, holder and days in stock." },
      { property: "og:title", content: "Inventory — Shop Stock" },
      { property: "og:description", content: "Every phone by IMEI, status, holder and age." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inventory,
});

function Inventory() {
  const { data: stock = [], isLoading } = useQuery(stockQuery);
  const { data: people = [] } = useQuery(profilesQuery);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [holder, setHolder] = useState("all");

  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.is_active ? p.name : `${p.name} (inactive)`]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "—");
  }, [people]);

  const rows = stock.filter((u) => {
    if (status !== "all" && u.status !== status) return false;
    if (holder !== "all" && u.current_holder_id !== holder) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.imei.toLowerCase().includes(q) ||
      u.model.toLowerCase().includes(q) ||
      (u.variant ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader title="Inventory" description={`${rows.length} of ${stock.length} units shown`} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input placeholder="Search IMEI or model" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="in_store">In store</SelectItem>
            <SelectItem value="with_agent">With agent</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
          </SelectContent>
        </Select>
        <Select value={holder} onValueChange={setHolder}>
          <SelectTrigger>
            <SelectValue placeholder="Holder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any holder</SelectItem>
            {people
              .filter((p) => p.role === "agent")
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">IMEI</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Holder</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  No units match these filters.
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const days = daysSince(u.date_added);
              const tone = u.status === "sold" ? "normal" : ageTone(days);
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-mono text-xs">{u.imei}</td>
                  <td className="px-4 py-3">
                    {u.model}
                    {u.variant && <span className="text-muted-foreground"> · {u.variant}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.status} />
                  </td>
                  <td className="px-4 py-3">{u.status === "with_agent" ? nameOf(u.current_holder_id) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(u.date_added)}</td>
                  <td
                    className={cn(
                      "px-4 py-3 font-medium",
                      tone === "danger" && "text-destructive",
                      tone === "warn" && "text-warning-foreground",
                    )}
                  >
                    {days} d
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
