// Super-admin action: clear lock metadata and restore tenant to active.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'unauthorized' })

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const uc = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await uc.auth.getUser()
  if (!u?.user) return json(401, { error: 'invalid_token' })

  const svc = createClient(SUPA_URL, SERVICE)
  const { data: sa } = await svc.rpc('is_super_admin', { _user_id: u.user.id })
  if (!sa) return json(403, { error: 'not_super_admin' })

  const { tenant_id } = await req.json().catch(() => ({}))
  if (!tenant_id) return json(400, { error: 'tenant_id required' })

  const { error } = await svc.from('tenants').update({
    status: 'active',
    locked_at: null, locked_reason: null, locked_by: null,
    flagged_for_deletion_at: null, scheduled_delete_at: null,
  }).eq('id', tenant_id)
  if (error) return json(500, { error: error.message })

  await svc.from('super_admin_audit_logs').insert({
    admin_user_id: u.user.id, action: 'tenant_reactivate', target_id: tenant_id, metadata: {},
  })
  return json(200, { ok: true })
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}