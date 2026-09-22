import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  employeeId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
};

export const currentUserQuery = {
  queryKey: ["current-user"],
  queryFn: async (): Promise<CurrentUser | null> => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return null;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);

    return {
      id: user.id,
      email: profile?.email ?? user.email ?? "",
      name: profile?.name ?? "",
      employeeId: profile?.employee_id ?? null,
      isActive: profile?.is_active ?? true,
      mustChangePassword: profile?.must_change_password ?? false,
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
      emailVerified: Boolean(user.email_confirmed_at),
    };
  },
};

export function useCurrentUser() {
  return useQuery(currentUserQuery);
}
