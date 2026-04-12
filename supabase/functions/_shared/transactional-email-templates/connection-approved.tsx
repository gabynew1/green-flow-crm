/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface ConnectionApprovedProps {
  providerName?: string
  dashboardUrl?: string
}

const ConnectionApprovedEmail = ({ providerName, dashboardUrl }: ConnectionApprovedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're now connected with {providerName || 'your provider'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Connection Approved! 🎉</Heading>
        <Text style={text}>
          Great news! {providerName ? `${providerName} has` : 'Your provider has'} approved your connection request.
        </Text>
        <Text style={text}>
          You can now view your properties, contracts, offers, and service visit reports from your dashboard.
        </Text>
        {dashboardUrl && (
          <Button style={button} href={dashboardUrl}>Go to Dashboard</Button>
        )}
        <Text style={footer}>This is an automated notification from the {SITE_NAME} platform.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ConnectionApprovedEmail,
  subject: (data: Record<string, any>) => data.providerName ? `Connected with ${data.providerName}` : 'Connection approved!',
  displayName: 'Connection approved',
  previewData: { providerName: 'GreenScape SRL' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
