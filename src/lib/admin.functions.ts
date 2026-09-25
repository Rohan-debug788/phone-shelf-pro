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

// First-admin self-setup was removed: the owner account exists, and new
// admins can only be created by an existing admin via createAgent.

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
    if (error) {
      const exists = /already been registered|already exists/i.test(error.message);
      return {
        ok: false as const,
        error: exists
          ? "An account with this email already exists. Use a different email, or reactivate/reset the existing account."
          : error.message,
      };
    }

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

    return { ok: true as const, tempPassword: password, userId: created.user?.id ?? null };
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

/**
 * Server-side sign-in: rate limit, verify the password with the auth service,
 * and write the audit record ourselves so callers cannot forge failures.
 */
export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) =>
    z
      .object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(200) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("event", "login_failed")
      .eq("email", email)
      .gte("created_at", since);
    if ((count ?? 0) >= 8) return { ok: false as const, reason: "locked" as const };

    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: signed, error } = await authClient.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !signed.session) {
      await supabaseAdmin.from("audit_log").insert({ email, event: "login_failed" });
      return { ok: false as const, reason: "invalid" as const };
    }
    await supabaseAdmin
      .from("audit_log")
      .insert({ user_id: signed.user?.id ?? null, email, event: "login_success" });
    return {
      ok: true as const,
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    };
  });

/** Sends a reset link server-side and records the request. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; origin: string }) =>
    z.object({ email: z.string().trim().email().max(255), origin: z.string().url().max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const origin = new URL(data.origin).origin;
    const { createClient } = await import("@supabase/supabase-js");
    const authClient = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    await authClient.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` }).catch(() => undefined);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({ email, event: "password_reset_requested" });
    return { ok: true as const };
  });

/** Audit events for the signed-in user; identity comes from the verified token. */
export const recordAuthEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { event: "password_changed" }) =>
    z.object({ event: z.enum(["password_changed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = typeof context.claims.email === "string" ? context.claims.email.toLowerCase() : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      email,
      event: data.event,
    });
    return { ok: true as const };
  });

export const listVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({ id: u.id, verified: Boolean(u.email_confirmed_at) }));
  });
