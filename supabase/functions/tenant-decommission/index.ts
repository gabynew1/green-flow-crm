// Super-admin action: soft-lock a tenant and schedule deletion in 180 days.
// Skips the "inactivity_warned" step (manual path).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const uc = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await uc.auth.getUser()
  if (!u?.user) return json(401, { error: 'invalid_token' })

  const svc = createClient(SUPA_URL, SERVICE)
  const { data: sa } = await svc.rpc('is_super_admin', { _user_id: u.user.id })
  if (!sa) return json(403, { error: 'not_super_admin' })

  const body = await req.json().catch(() => ({}))
  const tenantId = body.tenant_id as string | undefined
  const reason = (body.reason as string | undefined) ?? 'manually_decommissioned'
  if (!tenantId) return json(400, { error: 'tenant_id required' })

  const now = new Date()
  const scheduled = new Date(now)
  scheduled.setDate(scheduled.getDate() + 180)

  const { error } = await svc.from('tenants').update({
    status: 'soft_locked',
    locked_at: now.toISOString(),
    locked_reason: reason,
    locked_by: u.user.id,
    scheduled_delete_at: scheduled.toISOString(),
  }).eq('id', tenantId)
  if (error) return json(500, { error: error.message })

  await svc.from('super_admin_audit_logs').insert({
    admin_user_id: u.user.id,
    action: 'tenant_decommission',
    target_id: tenantId,
    metadata: { reason, scheduled_delete_at: scheduled.toISOString() },
  })

  return json(200, { ok: true, scheduled_delete_at: scheduled.toISOString() })
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}