import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { ImeiScanner } from "@/components/ImeiScanner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadCsv } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/add-stock")({
  head: () => ({
    meta: [
      { title: "Add stock — Shop Stock" },
      { name: "description", content: "Register new phone stock intake by scanning, typing or uploading IMEIs." },
      { property: "og:title", content: "Add stock — Shop Stock" },
      { property: "og:description", content: "Register new phone stock intake by IMEI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddStock,
});

type BulkRow = {
  imei: string;
  model: string;
  variant: string | null;
  supplier: string | null;
  date_added: string;
};

const IMEI_RE = /^[0-9]{10,20}$/;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function AddStock() {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [supplier, setSupplier] = useState("");
  const [dateReceived, setDateReceived] = useState(() => new Date().toISOString().slice(0, 10));
  const [imeis, setImeis] = useState("");
  const [busy, setBusy] = useState(false);

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkProblems, setBulkProblems] = useState<string[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (me && !me.isAdmin) {
    return <p className="text-sm text-muted-foreground">Only the shop owner can add stock.</p>;
  }

  function addScanned(code: string) {
    setImeis((prev) => {
      const list = prev.split(/[\s,]+/).filter(Boolean);
      if (list.includes(code)) {
        toast.info("That IMEI is already in the list");
        return prev;
      }
      return list.concat(code).join("\n");
    });
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
    const bad = list.find((i) => !IMEI_RE.test(i));
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

  function downloadTemplate() {
    downloadCsv("stock-upload-template.csv", [
      {
        imei: "356938035643809",
        model: "Galaxy S24 Ultra",
        variant: "256GB Titanium Grey",
        supplier: "Metro Distributors",
        date_received: new Date().toISOString().slice(0, 10),
      },
      {
        imei: "356938035643810",
        model: "iPhone 15",
        variant: "128GB Black",
        supplier: "Metro Distributors",
        date_received: new Date().toISOString().slice(0, 10),
      },
    ]);
  }

  async function onFile(file: File) {
    setBulkFileName(file.name);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      setBulkRows([]);
      setBulkProblems(["The file is empty."]);
      return;
    }
    const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = header.indexOf(n);
        if (i !== -1) return i;
      }
      return -1;
    };
    const iImei = idx("imei", "imei_number", "serial");
    const iModel = idx("model", "phone", "device");
    const iVariant = idx("variant", "storage", "colour", "color");
    const iSupplier = idx("supplier", "vendor");
    const iDate = idx("date_received", "date", "date_added");

    const problems: string[] = [];
    if (iImei === -1) problems.push("No 'imei' column found in the file.");
    if (iModel === -1) problems.push("No 'model' column found in the file.");
    if (problems.length > 0) {
      setBulkRows([]);
      setBulkProblems(problems);
      return;
    }

    const seen = new Set<string>();
    const rows: BulkRow[] = [];
    lines.slice(1).forEach((line, n) => {
      const cells = splitCsvLine(line);
      const imei = (cells[iImei] ?? "").replace(/\D/g, "");
      const modelCell = (cells[iModel] ?? "").trim();
      const rowNo = n + 2;
      if (!IMEI_RE.test(imei)) {
        problems.push(`Row ${rowNo}: "${cells[iImei] ?? ""}" is not a valid IMEI.`);
        return;
      }
      if (seen.has(imei)) {
        problems.push(`Row ${rowNo}: IMEI ${imei} appears more than once in the file.`);
        return;
      }
      if (!modelCell) {
        problems.push(`Row ${rowNo}: the model is missing.`);
        return;
      }
      seen.add(imei);
      const rawDate = iDate === -1 ? "" : (cells[iDate] ?? "").trim();
      const parsed = rawDate ? new Date(rawDate) : null;
      rows.push({
        imei,
        model: modelCell.slice(0, 80),
        variant: iVariant === -1 ? null : (cells[iVariant] ?? "").trim().slice(0, 80) || null,
        supplier: iSupplier === -1 ? null : (cells[iSupplier] ?? "").trim().slice(0, 120) || null,
        date_added: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString(),
      });
    });

    setBulkRows(rows);
    setBulkProblems(problems);
  }

  async function submitBulk() {
    if (bulkRows.length === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from("stock_units")
        .insert(bulkRows.map((r) => ({ ...r, status: "in_store" as const })));
      if (error) {
        if (error.code === "23505") {
          toast.error("One or more IMEIs in this file is already registered. Nothing was added.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock-units"] });
      toast.success(`${bulkRows.length} unit${bulkRows.length > 1 ? "s" : ""} added to store`);
      setBulkRows([]);
      setBulkProblems([]);
      setBulkFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBulkBusy(false);
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

        <ImeiScanner onScan={addScanned} />

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

      <section className="panel mt-6 max-w-2xl space-y-4 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold">Upload a spreadsheet</h2>
          <p className="text-sm text-muted-foreground">
            For large intakes with different models in one file. Columns: imei, model, variant, supplier, date_received.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={downloadTemplate}>
            Download template
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="max-w-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>

        {bulkFileName && (
          <p className="text-sm text-muted-foreground">
            {bulkFileName}: {bulkRows.length} ready, {bulkProblems.length} skipped.
          </p>
        )}

        {bulkProblems.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {bulkProblems.slice(0, 50).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        {bulkRows.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">IMEI</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Variant</th>
                  <th className="p-2">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((r) => (
                  <tr key={r.imei} className="border-t border-border">
                    <td className="p-2 font-mono text-xs">{r.imei}</td>
                    <td className="p-2">{r.model}</td>
                    <td className="p-2">{r.variant ?? "—"}</td>
                    <td className="p-2">{r.supplier ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button type="button" onClick={submitBulk} disabled={bulkBusy || bulkRows.length === 0}>
          {bulkBusy ? "Adding…" : `Add ${bulkRows.length} unit(s) to store`}
        </Button>
      </section>
    </>
  );
}
