import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { stockQuery } from "@/lib/queries";
import { PageHeader } from "@/components/AppShell";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/sell")({
  head: () => ({
    meta: [
      { title: "Record a sale — Shop Stock" },
      { name: "description", content: "Mark a phone you are holding as sold and capture buyer details." },
      { property: "og:title", content: "Record a sale — Shop Stock" },
      { property: "og:description", content: "Mark a held phone as sold." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sell,
});

function Sell() {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();
  const { data: stock = [] } = useQuery(stockQuery);
  const [openId, setOpenId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = stock.filter((u) => u.status === "with_agent" && u.current_holder_id === me?.id);
  const unit = mine.find((u) => u.id === openId);

  async function confirmSale(e: React.FormEvent) {
    e.preventDefault();
    if (!unit || !me) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("stock_units")
        .update({
          status: "sold",
          sold_by_id: me.id,
          date_sold: new Date().toISOString(),
        })
        .eq("id", unit.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      const { error: saleError } = await supabase.from("sales").insert({
        stock_unit_id: unit.id,
        sold_by_id: me.id,
        buyer_name: buyerName.trim() || null,
        buyer_phone: buyerPhone.trim() || null,
      });
      if (saleError) {
        toast.error(saleError.message);
        return;
      }
      await queryClient.invalidateQueries();
      toast.success("Sale recorded");
      setOpenId(null);
      setBuyerName("");
      setBuyerPhone("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Record a sale" description="Only phones currently assigned to you are listed." />

      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You are not holding any stock right now. Ask the shop owner to assign units to you.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((u) => (
            <div key={u.id} className="panel flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {u.model} {u.variant ? <span className="text-muted-foreground">· {u.variant}</span> : null}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{u.imei}</p>
              </div>
              <Button size="sm" onClick={() => setOpenId(u.id)}>
                Mark sold
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm sale</DialogTitle>
            <DialogDescription>
              {unit ? `${unit.model} · ${unit.imei}` : ""} — buyer details are optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmSale} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="buyer">Buyer name</Label>
              <Input id="buyer" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Buyer phone</Label>
              <Input id="phone" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} maxLength={30} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Saving…" : "Confirm sale"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
