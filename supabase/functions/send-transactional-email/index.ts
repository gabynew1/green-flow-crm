import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES, TEMPLATE_CATEGORY } from '../_shared/transactional-email-templates/registry.ts'

// Configuration baked in at scaffold time
const SITE_NAME = "green-flow-crm"
const SENDER_DOMAIN = "send.greengrasscrm.ro"
const FROM_DOMAIN = "send.greengrasscrm.ro"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth: verify_jwt = false; validate caller in code via getClaims().

// Per-template caller allowlist. Templates not listed here are internal-only
// (require the x-internal-service-key header). This blocks a signed-in user
// from sending arbitrary branded emails to arbitrary recipients.
//
//   "provider"    → PROVIDER_ADMIN or PROVIDER_STAFF may invoke; recipient must
//                   be in caller's tenant (or match caller's own email).
//   "client"      → CLIENT_USER may invoke; recipient must be a provider in
//                   the caller's tenant (or match caller's own email).
//   "self"        → any authenticated user, but recipient MUST match their email.
type CallerScope = 'provider' | 'client' | 'self'
const TEMPLATE_CALLER_ALLOWLIST: Record<string, CallerScope[]> = {
  'contract-sent':        ['provider'],
  'offer-sent':           ['provider'],
  'visit-report':         ['provider'],
  'inspection-scheduled': ['provider'],
  'contract-response':    ['client'],
  'offer-response':       ['client'],
  'test-notification':    ['provider', 'self'],
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Validate caller JWT
  const authHeader = req.headers.get('Authorization')
  const internalKey = req.headers.get('x-internal-service-key')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  // Internal service-role bypass for server-to-server calls (e.g. password reset).
  const isInternalCall = !!internalKey && !!supabaseServiceKey && internalKey === supabaseServiceKey

  // Caller identity resolved from JWT (only for non-internal calls)
  let callerUserId: string | null = null
  let callerEmail: string | null = null
  let callerRoles: string[] = []
  let callerTenantId: string | null = null

  if (!isInternalCall) {
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  if (!isInternalCall) {
    // Quick auth check via getClaims
    const authClient = createClient(supabaseUrl!, anonKey!, {
      global: { headers: { Authorization: authHeader! } },
    })
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
      authHeader!.replace('Bearer ', '')
    )
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    callerUserId = (claimsData.claims.sub as string) ?? null
    callerEmail = ((claimsData.claims.email as string | undefined) ?? '').toLowerCase() || null
  }

  if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let tenantId: string | null = null
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    if (typeof body.tenantId === 'string' && body.tenantId.length > 0) {
      tenantId = body.tenantId
    } else if (typeof body.tenant_id === 'string' && body.tenant_id.length > 0) {
      tenantId = body.tenant_id
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Resolve governance category for this template (defaults to 'account' = required)
  const category = TEMPLATE_CATEGORY[templateName] ?? 'account'

  // Enforce per-template caller allowlist for non-internal calls.
  if (!isInternalCall) {
    const allowedScopes = TEMPLATE_CALLER_ALLOWLIST[templateName]
    if (!allowedScopes || allowedScopes.length === 0) {
      // Not in the allowlist → this template is internal-only.
      console.warn('Template not callable by end users', { templateName, callerUserId })
      return new Response(
        JSON.stringify({ error: 'Template not permitted for this caller' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve caller role + tenant server-side (never trust the client).
    const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', callerUserId!),
      supabase.from('profiles').select('tenant_id, email').eq('user_id', callerUserId!).maybeSingle(),
    ])
    callerRoles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role)
    callerTenantId = ((profileRow as any)?.tenant_id as string | null) ?? null
    if (!callerEmail && (profileRow as any)?.email) {
      callerEmail = String((profileRow as any).email).toLowerCase()
    }

    const isProvider =
      callerRoles.includes('PROVIDER_ADMIN') || callerRoles.includes('PROVIDER_STAFF')
    const isClientUser = callerRoles.includes('CLIENT_USER')

    const recipientLower = effectiveRecipient.toLowerCase()
    let scopeSatisfied = false

    for (const scope of allowedScopes) {
      if (scope === 'self') {
        if (callerEmail && recipientLower === callerEmail) {
          scopeSatisfied = true
          break
        }
      } else if (scope === 'provider' && isProvider) {
        if (!callerTenantId) continue
        // Caller-supplied tenantId must match the caller's own tenant.
        if (tenantId && tenantId !== callerTenantId) continue
        // Recipient must be either the caller, or a customer/profile in the caller's tenant.
        if (callerEmail && recipientLower === callerEmail) { scopeSatisfied = true; break }
        const [{ data: cust }, { data: prof }] = await Promise.all([
          supabase.from('customers').select('id').eq('tenant_id', callerTenantId).ilike('email', recipientLower).limit(1),
          supabase.from('profiles').select('user_id').eq('tenant_id', callerTenantId).ilike('email', recipientLower).limit(1),
        ])
        if ((cust && cust.length > 0) || (prof && prof.length > 0)) {
          scopeSatisfied = true
          break
        }
      } else if (scope === 'client' && isClientUser) {
        if (callerEmail && recipientLower === callerEmail) { scopeSatisfied = true; break }
        // Recipient must be a provider in the caller's tenant.
        const { data: providerProfiles } = await supabase
          .from('profiles')
          .select('user_id, tenant_id')
          .ilike('email', recipientLower)
          .not('tenant_id', 'is', null)
          .limit(5)
        if (providerProfiles && providerProfiles.length > 0) {
          // Confirm caller shares tenant with recipient via client_connections/profile
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('customer_id')
            .eq('user_id', callerUserId!)
            .maybeSingle()
          const myCustomerId = (myProfile as any)?.customer_id as string | null
          if (myCustomerId) {
            const providerTenantIds = new Set(
              providerProfiles.map((p: any) => p.tenant_id).filter(Boolean)
            )
            const { data: myTenants } = await supabase
              .from('client_connections')
              .select('tenant_id')
              .eq('customer_id', myCustomerId)
            const myTenantIds = new Set(((myTenants ?? []) as any[]).map((r) => r.tenant_id))
            for (const t of providerTenantIds) {
              if (myTenantIds.has(t)) { scopeSatisfied = true; break }
            }
            if (scopeSatisfied) break
          }
        }
      }
    }

    if (!scopeSatisfied) {
      console.warn('Caller not permitted to send this template to this recipient', {
        templateName,
        callerUserId,
        roles: callerRoles,
      })
      return new Response(
        JSON.stringify({ error: 'Not permitted to send this template to this recipient' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      tenant_id: tenantId,
      category,
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 2b. Governance gate: tenant kill switch + user preference
  const { data: allowedData, error: allowedError } = await supabase.rpc(
    'email_send_allowed',
    {
      _email: effectiveRecipient.toLowerCase(),
      _category: category,
      _tenant_id: tenantId,
    }
  )

  if (allowedError) {
    console.error('Governance check failed — refusing to send', {
      error: allowedError,
      effectiveRecipient,
      category,
      tenantId,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Governance check failed',
      tenant_id: tenantId,
      category,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify send permissions' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (allowedData === false) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message: 'blocked_by_preferences',
      tenant_id: tenantId,
      category,
    })
    console.log('Email blocked by governance', {
      effectiveRecipient,
      templateName,
      category,
      tenantId,
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'blocked_by_preferences' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
      tenant_id: tenantId,
      category,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
        tenant_id: tenantId,
        category,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
        tenant_id: tenantId,
        category,
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
      tenant_id: tenantId,
      category,
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // 5. Enqueue the pre-rendered email for async processing by the dispatcher.
  // The dispatcher (process-email-queue) handles sending, retries, and rate-limit backoff.

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
    tenant_id: tenantId,
    category,
    template_data: templateData,
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email', {
      error: enqueueError,
      templateName,
      effectiveRecipient,
    })

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
      tenant_id: tenantId,
      category,
    })

    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Transactional email enqueued', { templateName, effectiveRecipient })

  return new Response(
    JSON.stringify({ success: true, queued: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
