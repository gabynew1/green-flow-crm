import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateTempPassword(len = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let pw = "";
  for (let i = 0; i < len; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate caller is super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = claimsData.claims.sub;

    // Check super admin
    const { data: isAdmin } = await anonClient.rpc("is_super_admin", { _user_id: callerUserId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: super admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, data } = await req.json();

    // Service role client for admin operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tempPassword = generateTempPassword();

    if (type === "provider") {
      const { companyName, fullName, email, phone, cui } = data;
      if (!companyName || !fullName || !email) {
        return new Response(JSON.stringify({ error: "companyName, fullName, and email are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. Create tenant
      const { data: tenant, error: tenantErr } = await adminClient
        .from("tenants")
        .insert({ name: companyName, created_by: callerUserId })
        .select()
        .single();
      if (tenantErr) throw tenantErr;

      // 2. Create auth user
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (authErr) throw authErr;

      const userId = authUser.user.id;

      // 3. Update profile (created by trigger)
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update({
          tenant_id: tenant.id,
          company_name: companyName,
          full_name: fullName,
          phone: phone || null,
          cui: cui || null,
          temporary_password: tempPassword,
        })
        .eq("user_id", userId);
      if (profileErr) throw profileErr;

      // 4. Update role to PROVIDER_ADMIN (trigger created CLIENT_USER)
      const { error: roleDelErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (roleDelErr) throw roleDelErr;

      const { error: roleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "PROVIDER_ADMIN" });
      if (roleErr) throw roleErr;

      return new Response(
        JSON.stringify({
          userId,
          email,
          temporaryPassword: tempPassword,
          tenantId: tenant.id,
          tenantName: companyName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (type === "customer") {
      const { name, contactPerson, email, phone } = data;
      if (!name || !contactPerson || !email) {
        return new Response(JSON.stringify({ error: "name, contactPerson, and email are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. Create auth user
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: contactPerson },
      });
      if (authErr) throw authErr;

      const userId = authUser.user.id;

      // 2. Create customer record
      const { data: customer, error: custErr } = await adminClient
        .from("customers")
        .insert({ name, contact_person_name: contactPerson, email, phone: phone || null })
        .select()
        .single();
      if (custErr) throw custErr;

      // 3. Update profile
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update({
          customer_id: customer.id,
          full_name: contactPerson,
          phone: phone || null,
          temporary_password: tempPassword,
        })
        .eq("user_id", userId);
      if (profileErr) throw profileErr;

      // Role is already CLIENT_USER from trigger

      return new Response(
        JSON.stringify({
          userId,
          email,
          temporaryPassword: tempPassword,
          customerId: customer.id,
          customerName: name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use 'provider' or 'customer'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("create-manual-user error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
