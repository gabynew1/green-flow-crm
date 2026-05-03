/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface OnboardingDay2Props {
  firstName?: string
  newCustomerUrl?: string
}

const OnboardingDay2Email = ({ firstName, newCustomerUrl }: OnboardingDay2Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Still tracking customers in WhatsApp? Add your first one in 30 seconds.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>{firstName ? `${firstName}, your first customer is one click away` : 'Your first customer is one click away'}</Heading>
        <Text style={text}>
          Most landscaping providers we talk to are still juggling customer details across WhatsApp, paper notebooks
          and a phone’s contacts app. {SITE_NAME} fixes that — once a customer is in, every property, visit and offer
          stays linked to them.
        </Text>
        <Container style={panel}>
          <Text style={panelText}>
            Adding a customer takes about 30 seconds. Name, phone, optional email — that’s it.
          </Text>
        </Container>
        {newCustomerUrl ? (
          <Button style={button} href={newCustomerUrl}>Add my first customer</Button>
        ) : null}
        <Text style={footer}>
          Already added one? Ignore this email — you’re ahead of schedule.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OnboardingDay2Email,
  subject: 'Stop juggling customer details — add one in 30 seconds',
  displayName: 'Onboarding · Day 2 (first customer)',
  previewData: { firstName: 'Andrei', newCustomerUrl: 'https://greengrasscrm.ro/provider/customers/new' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 24px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const panelText = { margin: '0', color: 'hsl(160, 30%, 15%)', fontSize: '14px', fontWeight: '600' as const }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '14px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: '700' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }