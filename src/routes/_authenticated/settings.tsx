import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/queries";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Shop details — Shop Stock" },
      { name: "description", content: "Shop name, address and contact information." },
      { property: "og:title", content: "Shop details — Shop Stock" },
      { property: "og:description", content: "Edit the shop's name, address and contacts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const { data } = useQuery(settingsQuery);
  const [f, setF] = useState({ shop_name: "", address: "", contact_info: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setF({ shop_name: data.shop_name, address: data.address, contact_info: data.contact_info });
  }, [data]);

  if (me && !me.isAdmin) return <p className="text-muted-foreground">Only administrators can edit shop details.</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("company_settings")
      .update({ ...f, shop_name: f.shop_name.trim().slice(0, 120), updated_at: new Date().toISOString() })
      .eq("id", true);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Shop details saved");
    qc.invalidateQueries({ queryKey: ["company-settings"] });
  }

  return (
    <>
      <PageHeader title="Shop details" />
      <form onSubmit={save} className="panel max-w-xl space-y-4 p-5">
        <div><Label>Shop name</Label><Input required maxLength={120} value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} /></div>
        <div><Label>Address</Label><Textarea maxLength={500} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div><Label>Contact info</Label><Textarea maxLength={500} value={f.contact_info} onChange={(e) => setF({ ...f, contact_info: e.target.value })} /></div>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </>
  );
}
