/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface OnboardingDay7Props {
  firstName?: string
  examplesUrl?: string
}

const OnboardingDay7Email = ({ firstName, examplesUrl }: OnboardingDay7Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>3 ways landscaping pros use {SITE_NAME} every week</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>{firstName ? `${firstName}, here’s what other pros are doing` : 'Here’s what other pros are doing'}</Heading>
        <Text style={text}>
          You’ve been with {SITE_NAME} for a week. Here are three workflows that pay off the fastest:
        </Text>
        <Container style={panel}>
          <Text style={step}><strong>Recurring contract.</strong> Lock in a monthly mowing or maintenance plan — visits get scheduled automatically.</Text>
          <Text style={step}><strong>Ad-hoc visit.</strong> One-off jobs (a fallen tree, a quick spray) — log them in seconds, bill them later.</Text>
          <Text style={step}><strong>AI Assistant.</strong> Ask it “What did we do for client X last month?” and get a clean answer in Romanian or English.</Text>
        </Container>
        {examplesUrl ? (
          <Button style={button} href={examplesUrl}>See examples</Button>
        ) : null}
        <Text style={footer}>
          Reply with the workflow you’re trying to nail and we’ll point you to the exact screen.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OnboardingDay7Email,
  subject: '3 ways landscaping pros use GreenGrass every week',
  displayName: 'Onboarding · Day 7 (examples)',
  previewData: { firstName: 'Andrei', examplesUrl: 'https://greengrasscrm.ro/provider' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 24px', padding: '16px 18px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const step = { fontSize: '14px', color: 'hsl(160, 30%, 15%)', lineHeight: '1.7', margin: '0 0 10px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '14px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: '700' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }