import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, ShieldCheck, ArrowLeftRight, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shop Stock — Phone Inventory & Stock Management" },
      {
        name: "description",
        content:
          "Track every phone by IMEI, assign stock to agents, record sales and run daily reports for your shop.",
      },
      { property: "og:title", content: "Shop Stock — Phone Inventory & Stock Management" },
      {
        property: "og:description",
        content: "IMEI-level stock tracking, agent custody and sales records for a single phone shop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Boxes, title: "Unit-level stock", text: "Every phone tracked by its own IMEI, never a loose count." },
  { icon: ArrowLeftRight, title: "Custody trail", text: "Assign stock to agents and reclaim it, with a full log." },
  { icon: Receipt, title: "Sales records", text: "Agents record sales from the phones they actually hold." },
  { icon: ShieldCheck, title: "Staff accounts", text: "Accounts are created by the shop owner. No public signup." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Shop Stock</p>
        <h1 className="mt-4 max-w-2xl font-display text-4xl leading-tight font-semibold sm:text-5xl">
          Know exactly which phone is where, and who has it.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          Inventory, custody and sales for a single phone shop. Staff sign in with accounts created by the
          owner.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel p-5">
              <f.icon className="size-5 text-accent" />
              <h2 className="mt-3 font-display text-base font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
