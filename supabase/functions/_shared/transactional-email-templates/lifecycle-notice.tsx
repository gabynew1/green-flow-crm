/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

type Step = 'prelock' | 'locked' | 'd30' | 'd90' | 'd150' | 'final5bd' | 'deleted'

interface Props {
  subjectKind?: 'tenant' | 'client'
  subjectName?: string
  recipientName?: string | null
  reactivateUrl?: string
  step?: Step
}

const STEP_COPY: Record<Step, { heading: (kind: string, name: string) => string; body: (kind: string) => string; cta?: string }> = {
  prelock: {
    heading: (_k, n) => `Your ${SITE_NAME} account "${n}" hasn't been used recently`,
    body: (k) => `Your ${k === 'tenant' ? 'workspace' : 'client account'} hasn't been signed in to for 180 days. We'll soft-lock it in 5 business days to reduce storage cost. Sign in any time to keep it active.`,
    cta: 'Sign in to keep my account',
  },
  locked: {
    heading: (_k, n) => `${n} has been locked`,
    body: (k) => `Your ${k === 'tenant' ? 'workspace' : 'client account'} is now locked. Your data is preserved for 180 days. Sign in any time to reactivate instantly.`,
    cta: 'Reactivate now',
  },
  d30: {
    heading: (_k, n) => `${n}: 30 days locked`,
    body: () => `Your account has been locked for 30 days. Sign in any time to reactivate. We'll delete all data 180 days after lock.`,
    cta: 'Reactivate now',
  },
  d90: {
    heading: (_k, n) => `${n}: 90 days locked`,
    body: () => `Your account has been locked for 90 days. Half of the recovery window is gone. Sign in to keep your data.`,
    cta: 'Reactivate now',
  },
  d150: {
    heading: (_k, n) => `${n}: scheduled for deletion in 30 days`,
    body: () => `Your account has been flagged for permanent deletion. You have 30 days to sign in and reactivate before all data is destroyed.`,
    cta: 'Reactivate now',
  },
  final5bd: {
    heading: (_k, n) => `${n}: final warning — 5 business days to deletion`,
    body: () => `Your account will be permanently deleted in the next 5 business days. Sign in NOW to keep your data.`,
    cta: 'Reactivate now',
  },
  deleted: {
    heading: (_k, n) => `${n}: account permanently deleted`,
    body: () => `Your account and all associated data have been permanently deleted as scheduled. We're sorry to see you go. You can sign up again at any time.`,
  },
}

const Email = ({ subjectKind = 'tenant', subjectName = 'your account', recipientName, reactivateUrl, step = 'prelock' }: Props) => {
  const copy = STEP_COPY[step] ?? STEP_COPY.prelock
  const heading = copy.heading(subjectKind, subjectName)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{SITE_NAME}</Text>
          <Heading style={h1}>{heading}</Heading>
          {recipientName && <Text style={text}>Hi {recipientName},</Text>}
          <Text style={text}>{copy.body(subjectKind)}</Text>
          {copy.cta && reactivateUrl && (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={reactivateUrl} style={button}>{copy.cta}</Button>
            </Section>
          )}
          <Text style={footer}>
            This is an automated notice from {SITE_NAME}. Sent only on business days.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const STEP_SUBJECT: Record<Step, string> = {
  prelock: 'Your account hasn\'t been used recently',
  locked: 'Your account has been locked',
  d30: 'Locked account: 30-day update',
  d90: 'Locked account: 90-day update',
  d150: 'Account scheduled for deletion in 30 days',
  final5bd: 'Final warning: deletion in 5 business days',
  deleted: 'Your account has been deleted',
}

function entry(step: Step, displayName: string): TemplateEntry {
  return {
    component: Email,
    subject: (d?: Record<string, any>) => {
      const name = d?.subjectName ? `: ${d.subjectName}` : ''
      return `${STEP_SUBJECT[step]}${name}`
    },
    displayName,
    previewData: { subjectKind: 'tenant', subjectName: 'Acme Landscaping', recipientName: 'Alex', reactivateUrl: 'https://greengrasscrm.ro/auth', step },
  }
}

export const prelock = entry('prelock', 'Lifecycle — pre-lock warning')
export const locked = entry('locked', 'Lifecycle — locked notice')
export const d30 = entry('d30', 'Lifecycle — 30 days locked')
export const d90 = entry('d90', 'Lifecycle — 90 days locked')
export const d150 = entry('d150', 'Lifecycle — 30 days to delete')
export const final5bd = entry('final5bd', 'Lifecycle — final 5 BD warning')
export const deleted = entry('deleted', 'Lifecycle — post-delete notice')

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 25%)', lineHeight: '1.7', margin: '0 0 14px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#fff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' as const }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 55%)', marginTop: '24px', borderTop: '1px solid hsl(140, 15%, 89%)', paddingTop: '12px' }