import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ShoppingCart, Store, UserCheck } from "lucide-react";
import { stockQuery, salesQuery, profilesQuery } from "@/lib/queries";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PageHeader } from "@/components/AppShell";
import { daysSince } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Shop Stock" },
      { name: "description", content: "Today's sales, stock split and aged stock alerts for your phone shop." },
      { property: "og:title", content: "Dashboard — Shop Stock" },
      { property: "og:description", content: "Today's sales, stock split and aged stock alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Boxes;
  label: string;
  value: number | string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={tone === "warn" ? "size-4 text-destructive" : "size-4 text-accent"} />
        {label}
      </div>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Dashboard() {
  const { data: me } = useCurrentUser();
  const { data: stock = [] } = useQuery(stockQuery);
  const { data: sales = [] } = useQuery(salesQuery);
  const { data: people = [] } = useQuery(profilesQuery);

  const isAdmin = me?.isAdmin ?? false;
  const today = new Date().toDateString();
  const todaySales = sales.filter((s) => new Date(s.created_at).toDateString() === today).length;

  const mine = stock.filter((u) => u.current_holder_id === me?.id && u.status === "with_agent");
  const inStore = stock.filter((u) => u.status === "in_store").length;
  const withAgents = stock.filter((u) => u.status === "with_agent").length;
  const sold = stock.filter((u) => u.status === "sold").length;
  const aged = stock.filter((u) => u.status !== "sold" && daysSince(u.date_added) > 60).length;

  const activeAgents = people.filter((p) => p.role === "agent" && p.is_active).length;

  return (
    <>
      <PageHeader
        title={`Hello, ${me?.name?.split(" ")[0] || "there"}`}
        description={isAdmin ? "Shop overview at a glance." : "Your stock and sales today."}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ShoppingCart} label={isAdmin ? "Sales today" : "My sales today"} value={todaySales} />
        {isAdmin ? (
          <>
            <Stat icon={Store} label="In store" value={inStore} />
            <Stat icon={UserCheck} label="With agents" value={withAgents} />
            <Stat icon={Boxes} label="Sold all time" value={sold} />
          </>
        ) : (
          <>
            <Stat icon={UserCheck} label="Units I hold" value={mine.length} />
            <Stat icon={Store} label="In store" value={inStore} />
            <Stat icon={Boxes} label="My sales all time" value={sales.length} />
          </>
        )}
      </div>

      {isAdmin && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="panel p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="size-4 text-destructive" />
              Aged stock
            </div>
            <p className="mt-2 font-display text-3xl font-semibold">{aged}</p>
            <p className="mt-1 text-sm text-muted-foreground">units in stock over 60 days</p>
            <Link to="/inventory" className="mt-3 inline-block text-sm underline underline-offset-4">
              Review inventory
            </Link>
          </div>
          <div className="panel p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCheck className="size-4 text-accent" />
              Active agents
            </div>
            <p className="mt-2 font-display text-3xl font-semibold">{activeAgents}</p>
            <Link to="/users" className="mt-3 inline-block text-sm underline underline-offset-4">
              Manage staff
            </Link>
          </div>
        </div>
      )}

      {!isAdmin && mine.length > 0 && (
        <div className="panel mt-4 p-5">
          <h2 className="font-display text-base font-semibold">Phones you're holding</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {mine.slice(0, 6).map((u) => (
              <li key={u.id} className="flex justify-between py-2">
                <span>
                  {u.model} {u.variant ? `· ${u.variant}` : ""}
                </span>
                <span className="text-muted-foreground">{u.imei}</span>
              </li>
            ))}
          </ul>
          <Link to="/sell" className="mt-3 inline-block text-sm underline underline-offset-4">
            Record a sale
          </Link>
        </div>
      )}
    </>
  );
}
