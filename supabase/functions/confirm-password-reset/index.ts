import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function validatePasswordComplexity(pw: string): string | null {
  if (typeof pw !== 'string') return 'Password is required.'
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  if (pw.length > 128) return 'Password is too long.'
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.'
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.'
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.'
  return null
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

  let token: string
  let newPassword: string
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token.trim() : ''
    newPassword = typeof body?.new_password === 'string' ? body.new_password : ''
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!token || token.length < 32 || token.length > 256) {
    return new Response(JSON.stringify({ error: 'Invalid or expired reset link.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const pwErr = validatePasswordComplexity(newPassword)
  if (pwErr) {
    return new Response(JSON.stringify({ error: pwErr }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const tokenHash = await sha256Hex(token)

  const { data: tokenRow, error: tokenErr } = await admin
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (tokenErr) {
    console.error('token lookup error', tokenErr)
    return new Response(JSON.stringify({ error: 'Server error. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!tokenRow) {
    return new Response(JSON.stringify({ error: 'Invalid or expired reset link.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (tokenRow.used_at) {
    return new Response(JSON.stringify({ error: 'This reset link has already been used. Please request a new one.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: 'This reset link has expired. Please request a new one.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Update password via admin API
  const { error: updateErr } = await admin.auth.admin.updateUserById(tokenRow.user_id, {
    password: newPassword,
  })

  if (updateErr) {
    console.error('password update error', updateErr)
    return new Response(JSON.stringify({ error: updateErr.message || 'Failed to update password.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Mark this token used + invalidate any other unused tokens for this user
  const nowIso = new Date().toISOString()
  await admin
    .from('password_reset_tokens')
    .update({ used_at: nowIso })
    .eq('user_id', tokenRow.user_id)
    .is('used_at', null)

  return new Response(JSON.stringify({ ok: true, message: 'Password updated successfully.' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})