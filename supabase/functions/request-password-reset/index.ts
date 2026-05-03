import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESET_BASE_URL = 'https://greengrasscrm.ro/reset-password'
const TOKEN_TTL_MINUTES = 60
const RATE_LIMIT_PER_HOUR = 3

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for this email, you'll receive a password reset link shortly.",
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let email: string
  try {
    const body = await req.json()
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Basic email validation; never leak whether it exists.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return new Response(JSON.stringify(GENERIC_RESPONSE), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const requestedIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    null

  try {
    // Look up the user by email via admin API (paginated; we expect exact match).
    // listUsers does not filter server-side, so we use an RPC-free approach:
    // query auth.users via service-role client.
    const { data: userRow, error: userErr } = await admin
      .schema('auth' as any)
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (userErr) {
      console.error('user lookup error', userErr)
    }

    if (!userRow?.id) {
      // Email not registered — return generic response (no enumeration).
      return new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = userRow.id as string

    // Rate limit: max N unused, unexpired tokens issued per user in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await admin
      .from('password_reset_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo)

    if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
      // Silently return generic; do not punish legitimate users with errors,
      // and do not reveal account existence to attackers.
      return new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate token + hash
    const rawToken = generateToken()
    const tokenHash = await sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString()

    const { error: insertErr } = await admin.from('password_reset_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      requested_ip: requestedIp,
    })
    if (insertErr) {
      console.error('token insert error', insertErr)
      return new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resetUrl = `${RESET_BASE_URL}?token=${rawToken}`

    // Dispatch the branded email via send-transactional-email (service-role auth)
    const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: 'password-reset',
        recipientEmail: email,
        idempotencyKey: `pwreset-${tokenHash.slice(0, 16)}`,
        templateData: {
          resetUrl,
          expiresInMinutes: TOKEN_TTL_MINUTES,
        },
      }),
    })

    if (!sendResp.ok) {
      const txt = await sendResp.text()
      console.error('send-transactional-email failed', sendResp.status, txt)
    }

    return new Response(JSON.stringify(GENERIC_RESPONSE), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('request-password-reset unexpected error', err)
    return new Response(JSON.stringify(GENERIC_RESPONSE), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})