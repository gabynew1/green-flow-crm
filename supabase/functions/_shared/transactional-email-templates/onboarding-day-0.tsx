/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface OnboardingDay0Props {
  firstName?: string
  dashboardUrl?: string
}

const OnboardingDay0Email = ({ firstName, dashboardUrl }: OnboardingDay0Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — 3 quick steps to get growing</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>{firstName ? `Welcome, ${firstName}!` : 'Welcome aboard!'}</Heading>
        <Text style={text}>
          Your workspace is ready. {SITE_NAME} helps you stop juggling spreadsheets and chats — everything about
          your customers, properties, visits and offers lives in one place.
        </Text>
        <Text style={textBold}>Three quick steps to get growing:</Text>
        <Container style={panel}>
          <Text style={step}><strong>1.</strong> Add your first customer</Text>
          <Text style={step}><strong>2.</strong> Create a property for them</Text>
          <Text style={step}><strong>3.</strong> Send your first offer</Text>
        </Container>
        {dashboardUrl ? (
          <Button style={button} href={dashboardUrl}>Open my dashboard</Button>
        ) : null}
        <Text style={footer}>
          Stuck? Just reply to this email — we read every message.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OnboardingDay0Email,
  subject: 'Welcome to GreenGrass — let’s get growing',
  displayName: 'Onboarding · Day 0 (welcome)',
  previewData: { firstName: 'Andrei', dashboardUrl: 'https://greengrasscrm.ro/provider' },
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