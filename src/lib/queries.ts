import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string;
  name: string;
  employee_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export type StockUnit = {
  id: string;
  imei: string;
  model: string;
  variant: string | null;
  status: "in_store" | "with_agent" | "sold";
  current_holder_id: string | null;
  date_added: string;
  date_sold: string | null;
  sold_by_id: string | null;
  supplier: string | null;
};

export type SaleRow = {
  id: string;
  stock_unit_id: string;
  sold_by_id: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  created_at: string;
};

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async () => {
    const [{ data: profiles, error }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (error) throw error;
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return (profiles ?? []).map((p) => ({
      ...(p as Profile),
      role: (roleMap.get(p.id) ?? "agent") as "admin" | "agent",
    }));
  },
});

export const stockQuery = queryOptions({
  queryKey: ["stock-units"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("stock_units")
      .select("*")
      .order("date_added", { ascending: false });
    if (error) throw error;
    return (data ?? []) as StockUnit[];
  },
});

export const salesQuery = queryOptions({
  queryKey: ["sales"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as SaleRow[];
  },
});

export const transfersQuery = queryOptions({
  queryKey: ["transfers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("stock_transfers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    return data ?? [];
  },
});

export const settingsQuery = queryOptions({
  queryKey: ["company-settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
    if (error) throw error;
    return data;
  },
});
