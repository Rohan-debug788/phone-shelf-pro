-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.stock_status AS ENUM ('in_store', 'with_agent', 'sold');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  employee_id text UNIQUE,
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_active)
$$;

CREATE POLICY "profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles readable by authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- Stock units
CREATE TABLE public.stock_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imei text NOT NULL UNIQUE,
  model text NOT NULL,
  variant text,
  status public.stock_status NOT NULL DEFAULT 'in_store',
  current_holder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  date_added timestamptz NOT NULL DEFAULT now(),
  date_sold timestamptz,
  sold_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_units TO authenticated;
GRANT ALL ON public.stock_units TO service_role;
ALTER TABLE public.stock_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock readable by authenticated" ON public.stock_units
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert stock" ON public.stock_units
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update stock" ON public.stock_units
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "agents sell own held units" ON public.stock_units
  FOR UPDATE TO authenticated
  USING (status = 'with_agent' AND current_holder_id = auth.uid() AND public.is_active_user(auth.uid()))
  WITH CHECK (status = 'sold' AND sold_by_id = auth.uid());
CREATE POLICY "admins delete stock" ON public.stock_units
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Transfers
CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_unit_id uuid NOT NULL REFERENCES public.stock_units(id) ON DELETE CASCADE,
  from_status public.stock_status NOT NULL,
  to_status public.stock_status NOT NULL,
  from_holder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_holder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers readable by authenticated" ON public.stock_transfers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "actors insert transfers" ON public.stock_transfers
  FOR INSERT TO authenticated WITH CHECK (performed_by_id = auth.uid());

-- Sales
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_unit_id uuid NOT NULL UNIQUE REFERENCES public.stock_units(id) ON DELETE CASCADE,
  sold_by_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_name text,
  buyer_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read all sales" ON public.sales
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "agents read own sales" ON public.sales
  FOR SELECT TO authenticated USING (sold_by_id = auth.uid());
CREATE POLICY "agents insert own sales" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (sold_by_id = auth.uid());

-- Company settings
CREATE TABLE public.company_settings (
  id boolean PRIMARY KEY DEFAULT true,
  shop_name text NOT NULL DEFAULT 'My Phone Shop',
  address text NOT NULL DEFAULT '',
  contact_info text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_singleton CHECK (id)
);
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable by authenticated" ON public.company_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins update settings" ON public.company_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.company_settings (id) VALUES (true);

-- Audit log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Profile auto-creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, employee_id, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NULLIF(NEW.raw_user_meta_data->>'employee_id',''),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'agent'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX idx_stock_status ON public.stock_units(status);
CREATE INDEX idx_stock_holder ON public.stock_units(current_holder_id);
CREATE INDEX idx_sales_soldby ON public.sales(sold_by_id);
