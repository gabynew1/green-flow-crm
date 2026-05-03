// Lifecycle onboarding drip — Phase 1
// Runs every 15 minutes via pg_cron. Scans candidates for Day 0 / Day 2 / Day 7
// onboarding emails for provider workspace owners and enqueues sends through
// the existing send-transactional-email function. Every candidate produces a row
// in lifecycle_email_log (sent or skipped) so we never double-send.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ROOT_DOMAIN = 'greengrasscrm.ro'
const DASHBOARD_URL = `https://${ROOT_DOMAIN}/provider`
const NEW_CUSTOMER_URL = `https://${ROOT_DOMAIN}/provider/customers/new`
const EXAMPLES_URL = `https://${ROOT_DOMAIN}/provider`

// Hard safety cap per cron tick to bound blast radius.
const SAFETY_CAP = 200

type Step = 'day_0' | 'day_2' | 'day_7'
type SkipReason =
  | 'category_disabled'
  | 'suppressed'
  | 'unsubscribed'
  | 'already_active'
  | 'email_not_verified'
  | 'tenant_paused'
  | 'safety_cap_hit'
  | 'missing_email'

interface Candidate {
  user_id: string
  tenant_id: string
  email: string
  first_name: string | null
  email_verified: boolean
  tenant_paused: boolean
  cat_onboarding_enabled: boolean
  customers_count: number
  visits_count: number
  offers_count: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const summary: Record<Step, { sent: number; skipped: Record<string, number> }> = {
    day_0: { sent: 0, skipped: {} },
    day_2: { sent: 0, skipped: {} },
    day_7: { sent: 0, skipped: {} },
  }

  for (const step of ['day_0', 'day_2', 'day_7'] as Step[]) {
    const candidates = await loadCandidates(supabase, step)

    if (candidates.length > SAFETY_CAP) {
      console.error('lifecycle-email-drip: safety cap hit', {
        step,
        count: candidates.length,
        cap: SAFETY_CAP,
      })
      // Log each as skipped so we don't try them again next tick
      for (const c of candidates) {
        await logResult(supabase, c, step, null, 'safety_cap_hit')
        summary[step].skipped['safety_cap_hit'] = (summary[step].skipped['safety_cap_hit'] || 0) + 1
      }
      continue
    }

    for (const c of candidates) {
      const skip = evaluateSkip(c)
      if (skip) {
        await logResult(supabase, c, step, null, skip)
        summary[step].skipped[skip] = (summary[step].skipped[skip] || 0) + 1
        continue
      }

      const ok = await sendStep(supabase, c, step)
      if (ok) {
        await logResult(supabase, c, step, new Date().toISOString(), null)
        summary[step].sent += 1
      } else {
        // Send failure already logs to email_send_log; record the lifecycle row
        // as skipped for now so the next cron tick doesn't pile on retries.
        await logResult(supabase, c, step, null, 'send_failed')
        summary[step].skipped['send_failed'] = (summary[step].skipped['send_failed'] || 0) + 1
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

function evaluateSkip(c: Candidate): SkipReason | null {
  if (!c.email) return 'missing_email'
  if (!c.email_verified) return 'email_not_verified'
  if (c.tenant_paused) return 'tenant_paused'
  if (!c.cat_onboarding_enabled) return 'category_disabled'
  return null
}

async function loadCandidates(
  supabase: ReturnType<typeof createClient>,
  step: Step,
): Promise<Candidate[]> {
  const { data, error } = await supabase.rpc('lifecycle_drip_candidates', {
    _step: step,
    _safety_cap: SAFETY_CAP + 1,
  })
  if (error) {
    console.error('loadCandidates failed', { step, error })
    return []
  }
  return (data ?? []) as Candidate[]
}

async function sendStep(
  supabase: ReturnType<typeof createClient>,
  c: Candidate,
  step: Step,
): Promise<boolean> {
  const templateName =
    step === 'day_0' ? 'onboarding-day-0'
    : step === 'day_2' ? 'onboarding-day-2'
    : 'onboarding-day-7'

  const templateData =
    step === 'day_0' ? { firstName: c.first_name ?? undefined, dashboardUrl: DASHBOARD_URL }
    : step === 'day_2' ? { firstName: c.first_name ?? undefined, newCustomerUrl: NEW_CUSTOMER_URL }
    : { firstName: c.first_name ?? undefined, examplesUrl: EXAMPLES_URL }

  try {
    const { data, error } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName,
        recipientEmail: c.email,
        idempotencyKey: `lifecycle-${step}-${c.user_id}`,
        tenantId: c.tenant_id,
        templateData,
      },
    })

    if (error) {
      console.error('send-transactional-email error', { step, user_id: c.user_id, error })
      return false
    }
    if (data?.success === false) {
      console.warn('send-transactional-email rejected', { step, user_id: c.user_id, reason: data.reason })
      // Suppression / preferences rejections still count as "handled" — log as sent
      // attempt skipped on the lifecycle side via the dedicated reason mapping
      return data.reason === 'email_suppressed' || data.reason === 'category_disabled' ? false : false
    }
    return true
  } catch (err) {
    console.error('send-transactional-email threw', { step, user_id: c.user_id, err: String(err) })
    return false
  }
}

async function logResult(
  supabase: ReturnType<typeof createClient>,
  c: Candidate,
  step: Step,
  sent_at: string | null,
  skipped_reason: string | null,
) {
  const { error } = await supabase.from('lifecycle_email_log').insert({
    user_id: c.user_id,
    tenant_id: c.tenant_id,
    step,
    sent_at,
    skipped_reason,
  })
  if (error && error.code !== '23505') {
    // 23505 = unique violation (already logged this tick — fine, idempotent)
    console.error('lifecycle_email_log insert failed', { step, user_id: c.user_id, error })
  }
}