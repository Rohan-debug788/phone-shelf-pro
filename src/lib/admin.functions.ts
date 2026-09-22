import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function tempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return (
    Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + "#7"
  );
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin access required");
}

/** Creates the very first admin account. Refuses once any admin exists. */
export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; name: string; password: string }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        name: z.string().trim().min(1).max(100),
        password: z.string().min(8).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("An administrator already exists for this shop.");

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
        role: "admin",
        must_change_password: false,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  return { exists: (count ?? 0) > 0 };
});

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; name: string; employeeId?: string; role?: string }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        name: z.string().trim().min(1).max(100),
        employeeId: z.string().trim().max(50).optional(),
        role: z.enum(["agent", "admin"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = tempPassword();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: false,
      user_metadata: {
        name: data.name,
        employee_id: data.employeeId ?? "",
        role: data.role ?? "agent",
        must_change_password: true,
      },
    });
    if (error) throw new Error(error.message);

    // Send the verification email (non-blocking for login).
    await supabaseAdmin.auth.admin
      .generateLink({ type: "signup", email: data.email, password })
      .catch(() => undefined);

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      email: data.email,
      event: "agent_created",
      detail: `Account created for ${data.name}`,
    });

    return { tempPassword: password, userId: created.user?.id ?? null };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; active: boolean }) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot deactivate your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      event: data.active ? "user_reactivated" : "user_deactivated",
      detail: data.userId,
    });
    return { ok: true as const };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = tempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.userId);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      event: "admin_password_reset",
      detail: data.userId,
    });
    return { tempPassword: password };
  });

/** Rate limiting + audit for sign-in attempts. */
export const checkLoginAllowed = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("event", "login_failed")
      .eq("email", data.email.toLowerCase())
      .gte("created_at", since);
    return { allowed: (count ?? 0) < 8 };
  });

export const recordAuthEvent = createServerFn({ method: "POST" })
  .inputValidator((d: { email?: string; event: string; detail?: string }) =>
    z
      .object({
        email: z.string().trim().max(255).optional(),
        event: z.enum(["login_failed", "login_success", "password_changed", "password_reset_requested"]),
        detail: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      email: data.email?.toLowerCase() ?? null,
      event: data.event,
      detail: data.detail ?? null,
    });
    return { ok: true as const };
  });
