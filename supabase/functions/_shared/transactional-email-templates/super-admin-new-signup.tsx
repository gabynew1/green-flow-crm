/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrassCRM'
const APP_URL = 'https://greengrasscrm.ro'

interface Props {
  recipientName?: string
  fullName?: string
  email?: string
  role?: string
  label?: string
  tenantName?: string
  profileId?: string
  signupAt?: string
}

const roleLabelRo = (role?: string) => {
  switch (role) {
    case 'PROVIDER_ADMIN': return 'Administrator furnizor'
    case 'PROVIDER_STAFF': return 'Personal furnizor'
    case 'CLIENT_USER':    return 'Client'
    default:               return role || 'Necunoscut'
  }
}

const SuperAdminNewSignupEmail = ({
  recipientName, fullName, email, role, label, tenantName, profileId, signupAt,
}: Props) => {
  const greeting = recipientName ? `Salut ${recipientName},` : 'Salut,'
  const headline = label === 'New provider account'
    ? 'Cont nou de furnizor'
    : label === 'New client account'
      ? 'Cont nou de client'
      : 'Cont nou creat'
  const detailsUrl = profileId ? `${APP_URL}/admin/users` : APP_URL

  return (
    <Html lang="ro" dir="ltr">
      <Head />
      <Preview>{`${headline}: ${fullName || email || ''}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{SITE_NAME} · Super Admin</Text>
          <Heading style={h1}>{headline}</Heading>
          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            Un cont nou a fost creat pe platformă. Detaliile sunt mai jos.
          </Text>

          <Section style={card}>
            <Row label="Nume" value={fullName || '—'} />
            <Row label="Email" value={email || '—'} />
            <Row label="Rol" value={roleLabelRo(role)} />
            {tenantName ? <Row label="Tenant" value={tenantName} /> : null}
            {signupAt ? <Row label="Creat la" value={signupAt} /> : null}
          </Section>

          <Button style={button} href={detailsUrl}>Deschide panoul admin</Button>

          <Hr style={hr} />
          <Text style={footer}>
            Primești acest email pentru că ești super admin pe {SITE_NAME}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={rowStyle}>
    <Text style={rowLabel}>{label}</Text>
    <Text style={rowValue}>{value}</Text>
  </div>
)

export const template = {
  component: SuperAdminNewSignupEmail,
  subject: (data: Record<string, any>) => {
    const name = data.fullName || data.email || 'utilizator nou'
    const label = data.label as string | undefined
    const tenant = data.tenantName ? ` (${data.tenantName})` : ''
    if (label === 'New provider account') return `Trial furnizor nou — ${name}${tenant}`
    if (label === 'New client account')   return `Client nou${tenant} — ${name}`
    return `Cont nou pe ${SITE_NAME} — ${name}`
  },
  displayName: 'Super Admin · Cont nou',
  previewData: {
    recipientName: 'Gabriel',
    fullName: 'Ion Popescu',
    email: 'ion@example.com',
    role: 'PROVIDER_ADMIN',
    label: 'New provider account',
    tenantName: 'Acme Gardens',
    profileId: '00000000-0000-0000-0000-000000000000',
    signupAt: '2026-06-25T10:00:00Z',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const eyebrow = { color: '#10b981', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 8px' }
const h1 = { color: '#0f172a', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#334155', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const card = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 18px', margin: '12px 0 20px' }
const rowStyle = { display: 'flex', justifyContent: 'space-between' as const, gap: '12px', borderBottom: '1px solid #e2e8f0', padding: '6px 0' }
const rowLabel = { color: '#64748b', fontSize: '12px', margin: 0 }
const rowValue = { color: '#0f172a', fontSize: '13px', fontWeight: 600, margin: 0, textAlign: 'right' as const }
const button = { backgroundColor: '#10b981', color: '#ffffff', borderRadius: '10px', padding: '12px 18px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 12px' }
const footer = { color: '#94a3b8', fontSize: '11px', margin: 0 }