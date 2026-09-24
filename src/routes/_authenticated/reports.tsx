import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { salesQuery, stockQuery, profilesQuery } from "@/lib/queries";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PageHeader } from "@/components/AppShell";
import { daysSince, ageTone, formatDate, statusLabel, downloadCsv } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Shop Stock" },
      { name: "description", content: "Sales by period and agent, aged stock, holdings and stock on hand." },
      { property: "og:title", content: "Reports — Shop Stock" },
      { property: "og:description", content: "Shop sales and stock reports with CSV download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function Reports() {
  const { data: me } = useCurrentUser();
  const { data: sales = [] } = useQuery(salesQuery);
  const { data: stock = [] } = useQuery(stockQuery);
  const { data: people = [] } = useQuery(profilesQuery);
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(isoDay(new Date()));

  const unit = useMemo(() => new Map(stock.map((u) => [u.id, u])), [stock]);
  const nameOf = useMemo(() => {
    const m = new Map(people.map((p) => [p.id, p.is_active ? p.name : `${p.name} (inactive)`]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "—");
  }, [people]);

  if (me && !me.isAdmin) return <p className="text-muted-foreground">Reports are available to administrators only.</p>;

  const inRange = sales.filter((s) => {
    const d = s.created_at.slice(0, 10);
    return d >= from && d <= to;
  });
  const salesRows = inRange.map((s) => {
    const u = unit.get(s.stock_unit_id);
    return { date: s.created_at.slice(0, 10), model: u?.model ?? "", variant: u?.variant ?? "", imei: u?.imei ?? "", sold_by: nameOf(s.sold_by_id), buyer: s.buyer_name ?? "", buyer_phone: s.buyer_phone ?? "" };
  });
  const byDay = Object.entries(salesRows.reduce<Record<string, number>>((a, r) => ((a[r.date] = (a[r.date] ?? 0) + 1), a), {})).sort().reverse().map(([date, units]) => ({ date, units }));
  const byAgent = Object.entries(salesRows.reduce<Record<string, number>>((a, r) => ((a[r.sold_by] = (a[r.sold_by] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([agent, units]) => ({ agent, units }));
  const aged = stock.filter((u) => u.status !== "sold").map((u) => ({ imei: u.imei, model: u.model, variant: u.variant ?? "", status: statusLabel[u.status], holder: nameOf(u.current_holder_id), date_added: formatDate(u.date_added), days: daysSince(u.date_added) })).sort((a, b) => b.days - a.days);
  const holdings = people.filter((p) => p.role === "agent").map((p) => {
    const held = stock.filter((u) => u.status === "with_agent" && u.current_holder_id === p.id);
    return { agent: nameOf(p.id), units_held: held.length, imeis: held.map((u) => u.imei).join(" ") };
  });
  const models = Array.from(new Set(stock.map((u) => u.model))).sort().map((model) => {
    const s = stock.filter((u) => u.model === model);
    return { model, in_store: s.filter((u) => u.status === "in_store").length, with_agents: s.filter((u) => u.status === "with_agent").length, on_hand: s.filter((u) => u.status !== "sold").length, sold: s.filter((u) => u.status === "sold").length };
  });

  return (
    <>
      <PageHeader title="Reports" description="Administrator-only reports. Every table can be downloaded as CSV." />
      <Tabs defaultValue="sales">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="aged">Aged stock</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="onhand">On hand vs sold</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            <Button variant="outline" onClick={() => { setFrom(isoDay(new Date())); setTo(isoDay(new Date())); }}>Today</Button>
            <Button variant="outline" onClick={() => { setFrom(isoDay(new Date(Date.now() - 6 * 86_400_000))); setTo(isoDay(new Date())); }}>Last 7 days</Button>
            <span className="text-sm text-muted-foreground">{salesRows.length} units sold</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ReportTable title="By day" rows={byDay} file={`sales-by-day-${from}-${to}.csv`} />
            <ReportTable title="By agent" rows={byAgent} file={`sales-by-agent-${from}-${to}.csv`} />
          </div>
          <ReportTable title="Sales detail" rows={salesRows} file={`sales-${from}-${to}.csv`} />
        </TabsContent>
        <TabsContent value="aged">
          <ReportTable title="Unsold stock by age (days since added)" rows={aged} file="aged-stock.csv" ageKey="days" />
        </TabsContent>
        <TabsContent value="holdings">
          <ReportTable title="Current holdings per agent" rows={holdings} file="holdings.csv" />
        </TabsContent>
        <TabsContent value="onhand">
          <ReportTable title="Stock on hand vs sold, by model" rows={models} file="stock-on-hand.csv" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ReportTable({ title, rows, file, ageKey }: { title: string; rows: Record<string, string | number>[]; file: string; ageKey?: string }) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display font-semibold">{title}</h2>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv(file, rows)}>
          <Download className="size-4" /> CSV
        </Button>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>{headers.map((h) => <th key={h} className="px-4 py-2">{h.replace(/_/g, " ")}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const tone = ageKey ? ageTone(Number(r[ageKey])) : "normal";
              return (
                <tr key={i} className={cn("border-t border-border", tone === "warn" && "bg-warning/10", tone === "danger" && "bg-destructive/10")}>
                  {headers.map((h) => <td key={h} className="px-4 py-2 break-all">{r[h]}</td>)}
                </tr>
              );
            })}
            {!rows.length && <tr><td className="px-4 py-8 text-center text-muted-foreground">No data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
