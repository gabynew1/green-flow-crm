/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface VisitCheckinProps {
  propertyName?: string
  providerName?: string
  timestamp?: string
}

const formatTs = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch { return iso }
}

const VisitCheckinEmail = ({ propertyName, providerName, timestamp }: VisitCheckinProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{providerName || 'Your provider'} just arrived{propertyName ? ` at ${propertyName}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Your service provider has arrived</Heading>
        <Text style={text}>
          {providerName ? `${providerName} has` : 'Your provider has'} checked in and is starting work now.
        </Text>
        <Section style={panel}>
          {propertyName && <Text style={panelText}>🏡 {propertyName}</Text>}
          {timestamp && <Text style={panelDetail}>Checked in: {formatTs(timestamp)}</Text>}
        </Section>
        <Text style={footer}>You'll get a completion summary once the visit is done. This is an automated notification from the {SITE_NAME} platform.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VisitCheckinEmail,
  subject: 'Your service provider has arrived',
  displayName: 'Visit check-in — sent to client',
  previewData: { propertyName: 'Vila Rozelor', providerName: 'GreenScape SRL', timestamp: new Date().toISOString() },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 16px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const panelText = { margin: '0 0 4px', color: 'hsl(160, 30%, 15%)', fontSize: '15px', fontWeight: '600' as const }
const panelDetail = { margin: '0 0 4px', color: 'hsl(160, 10%, 45%)', fontSize: '13px', lineHeight: '1.6' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }