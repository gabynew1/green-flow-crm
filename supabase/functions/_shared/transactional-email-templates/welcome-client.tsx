/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrassCRM'
const APP_URL = 'https://greengrasscrm.ro'

interface Props {
  firstName?: string
  dashboardUrl?: string
}

const WelcomeClientEmail = ({ firstName, dashboardUrl }: Props) => {
  const cta = dashboardUrl || `${APP_URL}/client`
  const greet = firstName ? `Bună, ${firstName}!` : 'Bine ai venit!'
  return (
    <Html lang="ro" dir="ltr">
      <Head />
      <Preview>Bun venit pe {SITE_NAME} — conectează prima proprietate</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{SITE_NAME}</Text>
          <Heading style={h1}>{greet}</Heading>
          <Text style={text}>
            Contul tău este gata. Aici poți urmări vizitele, contractele și ofertele primite de la furnizorul tău,
            fără mesaje pierdute pe WhatsApp sau emailuri rătăcite.
          </Text>
          <Text style={textBold}>Trei pași simpli:</Text>
          <Container style={panel}>
            <Text style={step}><strong>1.</strong> Adaugă prima proprietate</Text>
            <Text style={step}><strong>2.</strong> Conectează-te cu furnizorul tău folosind codul lui</Text>
            <Text style={step}><strong>3.</strong> Acceptă prima ofertă sau contract</Text>
          </Container>
          <Button style={button} href={cta}>Deschide contul meu</Button>
          <Text style={footer}>
            Ai întrebări? Răspunde la acest email — îți răspundem rapid.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeClientEmail,
  subject: (data: Record<string, any>) =>
    `Bun venit pe ${SITE_NAME}${data?.firstName ? `, ${data.firstName}` : ''}`,
  displayName: 'Bun venit · Client',
  previewData: { firstName: 'Maria', dashboardUrl: `${APP_URL}/client` },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '26px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 14px' }
const textBold = { fontSize: '15px', color: 'hsl(160, 30%, 15%)', lineHeight: '1.7', margin: '8px 0 12px', fontWeight: '600' as const }
const panel = { margin: '0 0 24px', padding: '16px 18px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const step = { fontSize: '14px', color: 'hsl(160, 30%, 15%)', lineHeight: '1.7', margin: '0 0 6px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '14px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: '700' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }