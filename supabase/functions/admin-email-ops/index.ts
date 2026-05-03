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
        const { data, error } = await admin.rpc('admin_replay_dlq', {
          p_queue: queue,
          p_msg_id: msg_id,
        })
        if (error) return json({ error: error.message }, 400)
        return json(data)
      }

      case 'discard_dlq': {
        const { queue, msg_id } = body
        const { data, error } = await admin.rpc('admin_discard_dlq', {
          p_queue: queue,
          p_msg_id: msg_id,
        })
        if (error) return json({ error: error.message }, 400)
        return json(data)
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