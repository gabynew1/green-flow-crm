// Called from the frontend right after sign-in. Bumps last-login on
// the caller's tenant (PROVIDER_ADMIN) or customer (CLIENT_USER) row and
// auto-reactivates if it was in a warning/locked/flagged state.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = userData.user.id
  const svc = createClient(SUPA_URL, SERVICE)

  const results: Record<string, unknown> = {}
  const { data: t, error: tErr } = await svc.rpc('touch_tenant_admin_login', { _user_id: userId })
  if (!tErr) results.tenant = t
  const { data: c, error: cErr } = await svc.rpc('touch_customer_client_login', { _user_id: userId })
  if (!cErr) results.customer = c

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})