// Hourly lifecycle worker. Walks tenants + customers, performs state
// transitions, sends business-day-gated emails (idempotent via
// lifecycle_email_log_v2), and hard-deletes when scheduled.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAY_MS = 86_400_000
const INACTIVITY_WARN_DAYS = 180
const WARN_TO_LOCK_BUSINESS_DAYS = 5
const LOCK_TO_FLAG_DAYS = 150
const LOCK_TO_DELETE_DAYS = 180
const FINAL_WARN_BUSINESS_DAYS = 5
const MAX_EMAILS_PER_RUN = 50

type Step = 'prelock' | 'locked' | 'd30' | 'd90' | 'd150' | 'final5bd' | 'deleted'

// Mutable per-run send budget so a holiday backlog can't blast Resend.
const runState = { emailsSent: 0 }
const canSendMore = () => runState.emailsSent < MAX_EMAILS_PER_RUN

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Safety net: sync auth.users.last_sign_in_at into tenants/customers
  // so non-web sign-ins still count as activity.
  const { data: syncRes } = await svc.rpc('sync_lifecycle_login_timestamps')

  runState.emailsSent = 0

  const { data: nowBiz } = await svc.rpc('is_business_moment', { _at: new Date().toISOString() })
  const businessNow = !!nowBiz

  const summary = {
    tenants: await processTenants(svc, businessNow),
    customers: await processCustomers(svc, businessNow),
    business_moment: businessNow,
    login_sync: syncRes ?? null,
    emails_sent: runState.emailsSent,
    email_cap: MAX_EMAILS_PER_RUN,
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function processTenants(svc: SupabaseClient, businessNow: boolean) {
  const out = { warned: 0, locked: 0, flagged: 0, deleted: 0, emails: 0 }

  // 1. active → inactivity_warned
  const cutoff = new Date(Date.now() - INACTIVITY_WARN_DAYS * DAY_MS).toISOString()
  const { data: stale } = await svc
    .from('tenants')
    .select('id,name,last_admin_login_at,status,created_at')
    .eq('status', 'active')
    .or(`last_admin_login_at.lt.${cutoff},and(last_admin_login_at.is.null,created_at.lt.${cutoff})`)
    .limit(200)

  for (const t of stale ?? []) {
    await svc.from('tenants').update({
      status: 'inactivity_warned',
      locked_reason: 'inactivity_180d',
    }).eq('id', t.id)
    out.warned++
    if (businessNow) {
      const sent = await sendStep(svc, 'tenant', t.id, t.name, 'prelock', new Date().toISOString())
      if (sent) out.emails++
    }
  }

  // 2. inactivity_warned → soft_locked after 5 business days
  //    Also retry prelock email if first transition happened outside business hours.
  const { data: warned } = await svc
    .from('tenants')
    .select('id,name,updated_at,last_admin_login_at')
    .eq('status', 'inactivity_warned')
    .limit(200)

  for (const t of warned ?? []) {
    const since = t.updated_at ?? new Date(Date.now() - 6 * DAY_MS).toISOString()
    // Idempotent: only fires if no prelock row exists for this cycle (warned_at = updated_at).
    if (businessNow) {
      const sent = await sendStep(svc, 'tenant', t.id, t.name, 'prelock', since)
      if (sent) out.emails++
    }
    const businessDays = await businessDaysBetween(svc, since, new Date().toISOString())
    if (businessDays < WARN_TO_LOCK_BUSINESS_DAYS) continue
    const lockedAt = new Date()
    const rawScheduled = new Date(lockedAt.getTime() + LOCK_TO_DELETE_DAYS * DAY_MS)
    const scheduled = await snapToBusinessMoment(svc, rawScheduled)
    await svc.from('tenants').update({
      status: 'soft_locked',
      locked_at: lockedAt.toISOString(),
      scheduled_delete_at: scheduled.toISOString(),
    }).eq('id', t.id)
    out.locked++
    if (businessNow) {
      const sent = await sendStep(svc, 'tenant', t.id, t.name, 'locked', lockedAt.toISOString())
      if (sent) out.emails++
    }
  }

  // 3. soft_locked d30 / d90 / d150 emails + flag
  const { data: locked } = await svc
    .from('tenants')
    .select('id,name,locked_at,scheduled_delete_at,status')
    .in('status', ['soft_locked', 'flagged_for_deletion'])
    .not('locked_at', 'is', null)
    .limit(500)

  for (const t of locked ?? []) {
    const lockedAt = new Date(t.locked_at!).getTime()
    const daysLocked = Math.floor((Date.now() - lockedAt) / DAY_MS)
    const cycle = t.locked_at!

    for (const [step, threshold] of [['d30', 30], ['d90', 90], ['d150', 150]] as const) {
      if (daysLocked >= threshold && businessNow) {
        const sent = await sendStep(svc, 'tenant', t.id, t.name, step, cycle)
        if (sent) out.emails++
      }
    }

    // Flag at 150
    if (t.status === 'soft_locked' && daysLocked >= LOCK_TO_FLAG_DAYS) {
      await svc.from('tenants').update({
        status: 'flagged_for_deletion',
        flagged_for_deletion_at: new Date().toISOString(),
      }).eq('id', t.id)
      out.flagged++
    }

    // T-5 business days final warn
    if (t.scheduled_delete_at && businessNow) {
      const bd = await businessDaysBetween(svc, new Date().toISOString(), t.scheduled_delete_at)
      if (bd <= FINAL_WARN_BUSINESS_DAYS && bd >= 0) {
        const sent = await sendStep(svc, 'tenant', t.id, t.name, 'final5bd', cycle)
        if (sent) out.emails++
      }
    }

    // Hard delete when due (must be business moment)
    if (
      t.status === 'flagged_for_deletion' &&
      t.scheduled_delete_at &&
      new Date(t.scheduled_delete_at).getTime() <= Date.now() &&
      businessNow
    ) {
      // Snapshot recipients first for post-mortem email
      const { data: recipients } = await svc
        .from('profiles')
        .select('user_id,email,full_name')
        .eq('tenant_id', t.id)
        .not('email', 'is', null)

      const { error: delErr } = await svc.rpc('hard_delete_tenant', {
        _tenant_id: t.id, _reason: 'lifecycle_expired', _triggered_by: 'cron',
      })
      if (!delErr) {
        out.deleted++
        for (const r of recipients ?? []) {
          await sendDirect(svc, 'tenant', t.id, t.name, 'deleted', cycle, r.user_id, r.email!, r.full_name)
          out.emails++
        }
      } else {
        console.error('hard_delete_tenant failed', t.id, delErr)
      }
    }
  }

  return out
}

async function processCustomers(svc: SupabaseClient, businessNow: boolean) {
  const out = { warned: 0, locked: 0, flagged: 0, deleted: 0, emails: 0 }

  const cutoff = new Date(Date.now() - INACTIVITY_WARN_DAYS * DAY_MS).toISOString()
  const { data: stale } = await svc
    .from('customers')
    .select('id,name,last_client_login_at,status,created_at')
    .eq('status', 'ACTIVE')
    .or(`last_client_login_at.lt.${cutoff},and(last_client_login_at.is.null,created_at.lt.${cutoff})`)
    .limit(200)

  for (const c of stale ?? []) {
    await svc.from('customers').update({
      status: 'inactivity_warned',
      locked_reason: 'inactivity_180d',
    }).eq('id', c.id)
    out.warned++
    if (businessNow) {
      const sent = await sendStep(svc, 'client', c.id, c.name, 'prelock', new Date().toISOString())
      if (sent) out.emails++
    }
  }

  const { data: warned } = await svc
    .from('customers')
    .select('id,name,updated_at')
    .eq('status', 'inactivity_warned')
    .limit(200)

  for (const c of warned ?? []) {
    const since = c.updated_at ?? new Date(Date.now() - 6 * DAY_MS).toISOString()
    if (businessNow) {
      const sent = await sendStep(svc, 'client', c.id, c.name, 'prelock', since)
      if (sent) out.emails++
    }
    const bd = await businessDaysBetween(svc, since, new Date().toISOString())
    if (bd < WARN_TO_LOCK_BUSINESS_DAYS) continue
    const lockedAt = new Date()
    const rawScheduled = new Date(lockedAt.getTime() + LOCK_TO_DELETE_DAYS * DAY_MS)
    const scheduled = await snapToBusinessMoment(svc, rawScheduled)
    await svc.from('customers').update({
      status: 'soft_locked',
      locked_at: lockedAt.toISOString(),
      scheduled_delete_at: scheduled.toISOString(),
    }).eq('id', c.id)
    out.locked++
    if (businessNow) {
      const sent = await sendStep(svc, 'client', c.id, c.name, 'locked', lockedAt.toISOString())
      if (sent) out.emails++
    }
  }

  const { data: locked } = await svc
    .from('customers')
    .select('id,name,locked_at,scheduled_delete_at,status')
    .in('status', ['soft_locked', 'flagged_for_deletion'])
    .not('locked_at', 'is', null)
    .limit(500)

  for (const c of locked ?? []) {
    const lockedAt = new Date(c.locked_at!).getTime()
    const daysLocked = Math.floor((Date.now() - lockedAt) / DAY_MS)
    const cycle = c.locked_at!

    for (const [step, threshold] of [['d30', 30], ['d90', 90], ['d150', 150]] as const) {
      if (daysLocked >= threshold && businessNow) {
        const sent = await sendStep(svc, 'client', c.id, c.name, step, cycle)
        if (sent) out.emails++
      }
    }

    if (c.status === 'soft_locked' && daysLocked >= LOCK_TO_FLAG_DAYS) {
      await svc.from('customers').update({
        status: 'flagged_for_deletion',
        flagged_for_deletion_at: new Date().toISOString(),
      }).eq('id', c.id)
      out.flagged++
    }

    if (c.scheduled_delete_at && businessNow) {
      const bd = await businessDaysBetween(svc, new Date().toISOString(), c.scheduled_delete_at)
      if (bd <= FINAL_WARN_BUSINESS_DAYS && bd >= 0) {
        const sent = await sendStep(svc, 'client', c.id, c.name, 'final5bd', cycle)
        if (sent) out.emails++
      }
    }

    if (
      c.status === 'flagged_for_deletion' &&
      c.scheduled_delete_at &&
      new Date(c.scheduled_delete_at).getTime() <= Date.now() &&
      businessNow
    ) {
      const { data: recipients } = await svc
        .from('profiles')
        .select('user_id,email,full_name')
        .eq('customer_id', c.id)
        .not('email', 'is', null)

      const { error: delErr } = await svc.rpc('hard_delete_customer', {
        _customer_id: c.id, _reason: 'lifecycle_expired', _triggered_by: 'cron',
      })
      if (!delErr) {
        out.deleted++
        for (const r of recipients ?? []) {
          await sendDirect(svc, 'client', c.id, c.name, 'deleted', cycle, r.user_id, r.email!, r.full_name)
          out.emails++
        }
      } else {
        console.error('hard_delete_customer failed', c.id, delErr)
      }
    }
  }

  return out
}

/** Computes inclusive count of business moments between two ISO timestamps. */
async function businessDaysBetween(svc: SupabaseClient, fromIso: string, toIso: string): Promise<number> {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (to.getTime() < from.getTime()) return -1
  let count = 0
  const cursor = new Date(from)
  cursor.setUTCHours(10, 0, 0, 0) // 10:00 UTC ~ 12:00 Bucharest
  while (cursor.getTime() <= to.getTime() && count < 365) {
    const { data } = await svc.rpc('is_business_moment', { _at: cursor.toISOString() })
    if (data === true) count++
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}

async function sendStep(
  svc: SupabaseClient,
  kind: 'tenant' | 'client',
  subjectId: string,
  subjectName: string,
  step: Step,
  cycleStartedAt: string,
): Promise<boolean> {
  // Fetch recipients
  const query =
    kind === 'tenant'
      ? svc.from('profiles').select('user_id,email,full_name').eq('tenant_id', subjectId).not('email', 'is', null)
      : svc.from('profiles').select('user_id,email,full_name').eq('customer_id', subjectId).not('email', 'is', null)

  const { data: recipients } = await query
  let anySent = false
  for (const r of recipients ?? []) {
    const sent = await sendDirect(svc, kind, subjectId, subjectName, step, cycleStartedAt, r.user_id, r.email!, r.full_name)
    if (sent) anySent = true
  }
  return anySent
}

async function sendDirect(
  svc: SupabaseClient,
  kind: 'tenant' | 'client',
  subjectId: string,
  subjectName: string,
  step: Step,
  cycleStartedAt: string,
  userId: string,
  email: string,
  fullName: string | null,
): Promise<boolean> {
  if (!canSendMore()) return false
  // Idempotency check
  const { data: existing } = await svc
    .from('lifecycle_email_log_v2')
    .select('id')
    .eq('subject_kind', kind).eq('subject_id', subjectId)
    .eq('cycle_started_at', cycleStartedAt).eq('step', step)
    .eq('recipient_user_id', userId).maybeSingle()
  if (existing) return false

  const templateName = `lifecycle-${step}`
  const reactivateUrl = kind === 'tenant'
    ? 'https://greengrasscrm.ro/auth'
    : 'https://greengrasscrm.ro/client'

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE}`,
        'x-internal-service-key': SERVICE,
      },
      body: JSON.stringify({
        templateName,
        recipientEmail: email,
        idempotencyKey: `lifecycle-${kind}-${subjectId}-${cycleStartedAt}-${step}-${userId}`,
        templateData: {
          subjectKind: kind,
          subjectName,
          recipientName: fullName ?? null,
          reactivateUrl,
          step,
        },
      }),
    })
    if (!r.ok) {
      console.error('send failed', step, await r.text())
      return false
    }
  } catch (e) {
    console.error('send threw', e)
    return false
  }

  await svc.from('lifecycle_email_log_v2').insert({
    subject_kind: kind,
    subject_id: subjectId,
    cycle_started_at: cycleStartedAt,
    step,
    recipient_user_id: userId,
    recipient_email: email,
  })
  runState.emailsSent++
  return true
}

/**
 * Ensures `scheduled_delete_at` lands on a Mon–Fri business moment so the
 * lifecycle-cron actually runs at that time. Avoids Sundays, holidays, and
 * the Aug/Dec shutdown windows.
 */
async function snapToBusinessMoment(svc: SupabaseClient, at: Date): Promise<Date> {
  const { data, error } = await svc.rpc('next_business_moment', { _from: at.toISOString() })
  if (error || !data) return at
  return new Date(data as string)
}