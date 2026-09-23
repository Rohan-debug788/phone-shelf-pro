import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/add-stock")({
  head: () => ({
    meta: [
      { title: "Add stock — Shop Stock" },
      { name: "description", content: "Register new phone stock intake with one IMEI per unit." },
      { property: "og:title", content: "Add stock — Shop Stock" },
      { property: "og:description", content: "Register new phone stock intake by IMEI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddStock,
});

function AddStock() {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [supplier, setSupplier] = useState("");
  const [dateReceived, setDateReceived] = useState(() => new Date().toISOString().slice(0, 10));
  const [imeis, setImeis] = useState("");
  const [busy, setBusy] = useState(false);

  if (me && !me.isAdmin) {
    return <p className="text-sm text-muted-foreground">Only the shop owner can add stock.</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = Array.from(
      new Set(
        imeis
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    if (list.length === 0) {
      toast.error("Enter at least one IMEI");
      return;
    }
    const bad = list.find((i) => !/^[0-9]{10,20}$/.test(i));
    if (bad) {
      toast.error(`"${bad}" is not a valid IMEI (10–20 digits)`);
      return;
    }

    setBusy(true);
    try {
      const rows = list.map((imei) => ({
        imei,
        model: model.trim(),
        variant: variant.trim() || null,
        supplier: supplier.trim() || null,
        date_added: new Date(dateReceived).toISOString(),
        status: "in_store" as const,
      }));
      const { error } = await supabase.from("stock_units").insert(rows);
      if (error) {
        if (error.code === "23505") {
          toast.error("One or more of these IMEIs is already registered. Nothing was added.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock-units"] });
      toast.success(`${rows.length} unit${rows.length > 1 ? "s" : ""} added to store`);
      setImeis("");
    } finally {
      setBusy(false);
    }
  }

  const count = imeis.split(/[\s,]+/).filter(Boolean).length;

  return (
    <>
      <PageHeader title="Add stock" description="Each phone needs its own IMEI." />
      <form onSubmit={submit} className="panel max-w-2xl space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variant">Variant (storage / colour)</Label>
            <Input id="variant" value={variant} onChange={(e) => setVariant(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Supplier</Label>
            <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Date received</Label>
            <Input id="date" type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="imeis">IMEIs — one per line</Label>
          <Textarea
            id="imeis"
            rows={8}
            value={imeis}
            onChange={(e) => setImeis(e.target.value)}
            placeholder={"356938035643809\n356938035643810"}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{count} unit(s) ready to add</p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add to store"}
        </Button>
      </form>
    </>
  );
}
