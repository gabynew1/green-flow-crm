import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'
const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

// Apply tenant branding to From and Subject when tenant_name is present
function applyTenantBranding(payload: Record<string, unknown>): { from: string; subject: string } {
  const tenantName = payload.tenant_name as string | undefined
  let from = payload.from as string
  let subject = payload.subject as string

  if (tenantName) {
    // Rewrite From: "TenantName via GreenGrass CRM" <noreply@greengrasscrm.ro>
    const emailMatch = from.match(/<([^>]+)>/)
    const email = emailMatch ? emailMatch[1] : from
    from = `"${tenantName} via GreenGrass CRM" <${email}>`

    // Prefix subject: [TenantName] Original Subject
    if (!subject.startsWith(`[${tenantName}]`)) {
      subject = `[${tenantName}] ${subject}`
    }
  }

  return { from, subject }
}

// Send an email via the Resend connector gateway.
// Returns the Resend email id so the handoff can be traced from the admin activity log.
async function sendViaResend(
  payload: Record<string, unknown>,
  lovableApiKey: string,
  resendApiKey: string
): Promise<string | null> {
  const { from, subject } = applyTenantBranding(payload)

  // The Resend connector gateway requires `to` as a plain string.
  // Normalize any shape (string, array, nested array) down to one recipient.
  const rawTo: unknown = payload.to
  let to = rawTo
  while (Array.isArray(to)) to = to[0]
  if (typeof to !== 'string' || !to.trim()) {
    const err = new Error(
      `Invalid recipient in email payload: ${JSON.stringify(rawTo)}`
    )
    ;(err as any).status = 422
    throw err
  }

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': resendApiKey,
    },
    body: JSON.stringify({
      from,
      to: to.trim(),
      subject,
      html: payload.html as string,
      ...(payload.text ? { text: payload.text as string } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    const err = new Error(`Resend API error [${response.status}]: ${body}`)
    ;(err as any).status = response.status
    // Parse Retry-After header for 429s
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) {
      ;(err as any).retryAfterSeconds = parseInt(retryAfter, 10) || 60
    }
    throw err
  }

  try {
    const body = await response.json()
    const id = body?.id ?? body?.data?.id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

// Constant-length-ish comparison of two secrets.
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}


async function moveToDlq(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string
): Promise<void> {
  const payload = msg.message
  await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: (payload.label || queue) as string,
    recipient_email: payload.to,
    status: 'dlq',
    error_message: reason,
    tenant_id: (payload.tenant_id as string | null) ?? null,
    category: (payload.category as string | null) ?? null,
    template_data: (payload.template_data as Record<string, unknown> | null) ?? null,
  })
  const { error } = await supabase.rpc('move_to_dlq', {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', { queue, msg_id: msg.msg_id, reason, error })
  }
}

Deno.serve(async (req) => {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!lovableApiKey || !resendApiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    if (!messages?.length) continue

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      // pgmq native retry counter: read_ct increments on every dequeue.
      const attempts = Math.max(0, (msg.read_ct ?? 1) - 1)
      const logBase = {
        message_id: payload.message_id,
        template_name: (payload.label || queue) as string,
        recipient_email: payload.to,
        tenant_id: (payload.tenant_id as string | null) ?? null,
        category: (payload.category as string | null) ?? null,
        template_data: (payload.template_data as Record<string, unknown> | null) ?? null,
      }

      // Drop expired messages (TTL exceeded)
      if (payload.queued_at) {
        const ageMs = Date.now() - new Date(payload.queued_at).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue, msg_id: msg.msg_id, queued_at: payload.queued_at, ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(supabase, queue, msg, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached
      if (attempts >= MAX_RETRIES) {
        await moveToDlq(supabase, queue, msg, `Max retries (${MAX_RETRIES}) exceeded (attempted ${attempts} times)`)
        continue
      }

      // Guard: skip if another worker already sent this message
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue, msg_id: msg.msg_id, message_id: payload.message_id,
          })
          await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
          continue
        }
      }

      try {
        const resendId = await sendViaResend(payload, lovableApiKey, resendApiKey)

        // Log success
        await supabase.from('email_send_log').insert({
          ...logBase,
          status: 'sent',
          metadata: resendId ? { resend_id: resendId } : null,
        })

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete sent message from queue', { queue, msg_id: msg.msg_id, error: delError })
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('Email send failed', {
          queue, msg_id: msg.msg_id, read_ct: msg.read_ct, attempts, error: errorMsg,
        })

        if (isRateLimited(error)) {
          await supabase.from('email_send_log').insert({
            ...logBase,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })
          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'rate_limited' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (isForbidden(error)) {
          // 403 from Resend = API key not scoped to send.greengrasscrm.ro,
          // OR the domain is not verified in Resend. NOT a Lovable kill switch.
          // See supabase/functions/_shared/EMAIL_POLICY.md (Failure mode quick reference).
          const reason = `Resend 403 (domain/API-key scope): ${errorMsg.slice(0, 800)}`
          await moveToDlq(supabase, queue, msg, reason)
          return new Response(
            JSON.stringify({ processed: totalProcessed, stopped: 'resend_forbidden' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        }

        await supabase.from('email_send_log').insert({
          ...logBase,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })
      }

      // Small delay between sends
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
