DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "admins read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "roles readable by authenticated" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "settings readable by authenticated" ON public.company_settings;
CREATE POLICY "active staff read settings" ON public.company_settings FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "stock readable by authenticated" ON public.stock_units;
CREATE POLICY "active staff read stock" ON public.stock_units FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "transfers readable by authenticated" ON public.stock_transfers;
CREATE POLICY "admins read all transfers" ON public.stock_transfers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff read own transfers" ON public.stock_transfers FOR SELECT TO authenticated
  USING (from_holder_id = auth.uid() OR to_holder_id = auth.uid() OR performed_by_id = auth.uid());

-- Minimal staff directory (names only, no emails) for active staff
CREATE OR REPLACE FUNCTION public.staff_directory()
RETURNS TABLE (id uuid, name text, employee_id text, is_active boolean, role public.app_role, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.name, p.employee_id, p.is_active,
         COALESCE((SELECT r.role FROM public.user_roles r WHERE r.user_id = p.id ORDER BY (r.role = 'admin') DESC LIMIT 1), 'agent'::public.app_role),
         p.created_at
  FROM public.profiles p
  WHERE public.is_active_user(auth.uid())
  ORDER BY p.created_at;
$$;
REVOKE ALL ON FUNCTION public.staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;