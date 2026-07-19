/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrassCRM'
const APP_URL = 'https://greengrasscrm.ro'

interface Props {
  recipient_name?: string
  client_name?: string
  client_email?: string
  property_name?: string
  preferred_date?: string
  description?: string
  tenant_name?: string
  request_id?: string
}

const VisitRequestCreatedEmail = ({
  recipient_name,
  client_name,
  client_email,
  property_name,
  preferred_date,
  description,
  tenant_name,
}: Props) => {
  const cta = `${APP_URL}/provider/visit-requests`
  const greet = recipient_name ? `Bună, ${recipient_name}!` : 'Bună!'
  return (
    <Html lang="ro" dir="ltr">
      <Head />
      <Preview>{`Cerere nouă de vizită de la ${client_name || 'un client'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{SITE_NAME}{tenant_name ? ` · ${tenant_name}` : ''}</Text>
          <Heading style={h1}>{greet}</Heading>
          <Text style={text}>
            Un client a trimis o cerere nouă de vizită. Verifică-o și programează sau declină în panoul „Cereri de vizită".
          </Text>
          <Container style={panel}>
            <Text style={row}><strong>Client:</strong> {client_name || '—'}{client_email ? ` (${client_email})` : ''}</Text>
            {property_name ? <Text style={row}><strong>Proprietate:</strong> {property_name}</Text> : null}
            {preferred_date ? <Text style={row}><strong>Preferă:</strong> {preferred_date}</Text> : null}
            {description ? <Text style={row}><strong>Detalii:</strong> {description}</Text> : null}
          </Container>
          <Button style={button} href={cta}>Deschide cererile</Button>
          <Text style={footer}>
            Primești acest email pentru că ești administrator{tenant_name ? ` al ${tenant_name}` : ''}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: VisitRequestCreatedEmail,
  subject: (data: Record<string, any>) =>
    `Cerere nouă de vizită${data?.client_name ? ` — ${data.client_name}` : ''}`,
  displayName: 'Cerere nouă de vizită',
  previewData: {
    recipient_name: 'Andrei',
    client_name: 'Maria Popescu',
    client_email: 'maria@example.com',
    property_name: 'Grădina Popescu',
    preferred_date: '2026-07-25',
    description: 'Aș vrea o tundere înainte de weekend.',
    tenant_name: 'Acme Gardens',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 14px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 14px' }
const panel = { margin: '0 0 22px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const row = { fontSize: '14px', color: 'hsl(160, 30%, 15%)', lineHeight: '1.6', margin: '0 0 6px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '14px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: '700' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '24px 0 0' }