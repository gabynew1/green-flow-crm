import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.4/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(JSON.stringify({ error: "target_user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is PROVIDER_ADMIN
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "PROVIDER_ADMIN")
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Only admins can reset passwords" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify same tenant (unless resetting own password)
    if (target_user_id !== caller.id) {
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", caller.id)
        .single();

      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", target_user_id)
        .single();

      if (!callerProfile || !targetProfile || callerProfile.tenant_id !== targetProfile.tenant_id) {
        return new Response(JSON.stringify({ error: "Target user not in your organization" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate temporary password
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let tempPassword = "";
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    for (const b of arr) {
      tempPassword += chars[b % chars.length];
    }
    // Ensure policy compliance: at least 1 uppercase, 1 number, 1 special
    tempPassword = "A1!" + tempPassword;

    // Update auth password
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
      password: tempPassword,
    });
    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to reset password: " + updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store temporary password in profile
    await adminClient
      .from("profiles")
      .update({ temporary_password: tempPassword })
      .eq("user_id", target_user_id);

    return new Response(JSON.stringify({ temporary_password: tempPassword }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
