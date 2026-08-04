import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// verify_jwt = false; we validate the caller in code
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Validate caller and check super-admin
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: isSuper, error: superErr } = await admin.rpc('is_super_admin', {
    _user_id: userData.user.id,
  })
  if (superErr || !isSuper) {
    return json({ error: 'Forbidden: super admin required' }, 403)
  }

  // The admin_* email RPCs re-check auth.uid() themselves, so they must be
  // called with the caller's JWT — the service-role client has no auth.uid().
  const asCaller = userClient

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = body?.action as string
  try {
    switch (action) {
      case 'resend': {
        const messageId = body.message_id as string
        if (!messageId) return json({ error: 'message_id required' }, 400)

        // Get template + data via RPC (writes audit row)
        const { data: resendInfo, error: rErr } = await admin.rpc(
          'admin_resend_email',
          { p_message_id: messageId },
        )
        if (rErr) return json({ error: rErr.message }, 400)

        // Re-invoke send-transactional-email with the original payload
        const sendRes = await fetch(
          `${supabaseUrl}/functions/v1/send-transactional-email`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              template: resendInfo.template_name,
              to: resendInfo.recipient_email,
              data: resendInfo.template_data,
              idempotency_key: resendInfo.new_message_id,
              purpose: 'transactional',
            }),
          },
        )
        const sendBody = await sendRes.json().catch(() => ({}))
        if (!sendRes.ok) {
          return json({ error: 'Resend failed', details: sendBody }, 502)
        }
        return json({
          success: true,
          new_message_id: resendInfo.new_message_id,
          send: sendBody,
        })
      }

      case 'replay_dlq': {
        const { queue, msg_id } = body
        const { data, error } = await asCaller.rpc('admin_replay_dlq', {
          p_queue: queue,
          p_msg_id: msg_id,
        })
        if (error) return json({ error: error.message }, 400)
        return json(data)
      }

      case 'discard_dlq': {
        const { queue, msg_id } = body
        const { data, error } = await asCaller.rpc('admin_discard_dlq', {
          p_queue: queue,
          p_msg_id: msg_id,
        })
        if (error) return json({ error: error.message }, 400)
        return json(data)
      }

      case 'replay_dlq_bulk':
      case 'discard_dlq_bulk': {
        const rpcName =
          action === 'replay_dlq_bulk' ? 'admin_replay_dlq' : 'admin_discard_dlq'
        const queues: string[] = body.queue
          ? [body.queue]
          : ['transactional_emails', 'auth_emails']
        let ok = 0
        const failures: { msg_id: number; error: string }[] = []

        for (const queue of queues) {
          let ids: number[] = Array.isArray(body.msg_ids) ? body.msg_ids : []
          if (ids.length === 0) {
            const { data: rows, error: listErr } = await asCaller.rpc(
              'admin_list_dlq',
              { p_queue: queue, p_limit: 500 },
            )
            if (listErr) return json({ error: listErr.message }, 400)
            ids = (rows ?? []).map((r: any) => r.msg_id)
          }
          for (const msgId of ids) {
            const { error } = await asCaller.rpc(rpcName, {
              p_queue: queue,
              p_msg_id: msgId,
            })
            if (error) failures.push({ msg_id: msgId, error: error.message })
            else ok++
          }
        }
        return json({ success: failures.length === 0, processed: ok, failures })
      }

      case 'clear_rate_limit': {
        const { data, error } = await asCaller.rpc('admin_clear_email_rate_limit')
        if (error) return json({ error: error.message }, 400)
        return json(data)
      }

      case 'run_dispatcher': {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/process-email-queue`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              'Content-Type': 'application/json',
              'Lovable-Context': 'cron',
            },
            body: '{}',
          },
        )
        const out = await res.json().catch(() => ({}))
        if (!res.ok) return json({ error: 'Dispatcher run failed', details: out }, 502)
        return json({ success: true, result: out })
      }

      case 'verify_resend': {
        const lovableKey = Deno.env.get('LOVABLE_API_KEY')
        const resendKey = Deno.env.get('RESEND_API_KEY')
        if (!lovableKey || !resendKey) {
          return json({
            status: 'unreachable',
            message: 'Resend connector is not configured for this project.',
          })
        }
        try {
          const res = await fetch(
            'https://connector-gateway.lovable.dev/api/v1/verify_credentials',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                'X-Connection-Api-Key': resendKey,
              },
            },
          )
          const out = await res.json().catch(() => ({}))
          if (!res.ok) {
            return json({
              status: res.status === 401 || res.status === 403 ? 'auth_failed' : 'unreachable',
              message: `Gateway responded ${res.status}`,
              details: out,
            })
          }
          const outcome = (out as any)?.outcome
          return json({
            status: outcome === 'failed' ? 'auth_failed' : 'ok',
            message: outcome === 'skipped' ? 'Connector reachable (no verification endpoint).' : 'Resend connector responded.',
            details: out,
          })
        } catch (e) {
          return json({
            status: 'unreachable',
            message: e instanceof Error ? e.message : 'Network error',
          })
        }
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}