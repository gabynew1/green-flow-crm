import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Auth: verify_jwt = false; we validate caller in code.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  let messageId: string | null = null
  try {
    const url = new URL(req.url)
    messageId = url.searchParams.get('messageId')
    if (!messageId) {
      const body = await req.json().catch(() => ({}))
      messageId = body.messageId || body.message_id || null
    }
  } catch {
    // ignore
  }

  if (!messageId) {
    return new Response(JSON.stringify({ error: 'messageId is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Use the caller's JWT so the SECURITY DEFINER RPC can enforce per-user access.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await userClient.rpc('get_email_for_webview', {
    _message_id: messageId,
  })

  if (error) {
    console.error('get_email_for_webview failed', error)
    return new Response(JSON.stringify({ error: 'Failed to load email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return new Response(
      JSON.stringify({ error: 'not_found', reason: 'unavailable_or_expired' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const template = TEMPLATES[row.template_name]
  if (!template) {
    return new Response(
      JSON.stringify({ error: 'template_unavailable' }),
      { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const data_ = (row.template_data && typeof row.template_data === 'object')
    ? row.template_data
    : (template.previewData || {})

  let html: string
  try {
    html = await renderAsync(React.createElement(template.component, data_))
  } catch (err) {
    console.error('render failed', err)
    return new Response(JSON.stringify({ error: 'render_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const subject =
    typeof template.subject === 'function'
      ? template.subject(data_)
      : template.subject

  return new Response(
    JSON.stringify({
      html,
      subject,
      template_name: row.template_name,
      category: row.category,
      status: row.status,
      recipient_email: row.recipient_email,
      created_at: row.created_at,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})