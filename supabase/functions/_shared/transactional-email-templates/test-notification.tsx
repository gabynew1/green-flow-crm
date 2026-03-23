/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface TestNotificationProps {
  name?: string
}

const TestNotificationEmail = ({ name }: TestNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Test notification from {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>
          {name ? `Hey ${name}, it works!` : 'Your notification system is live!'}
        </Heading>
        <Text style={text}>
          This is a test email from {SITE_NAME}. If you're reading this, your app email infrastructure is working correctly.
        </Text>
        <Container style={panel}>
          <Text style={panelText}>✅ Email queue — operational</Text>
        </Container>
        <Text style={footer}>
          This is an automated test from the {SITE_NAME} platform.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TestNotificationEmail,
  subject: 'Test notification from GreenGrass',
  displayName: 'Test notification',
  previewData: { name: 'Admin' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  padding: '24px 12px',
}

const container = {
  padding: '32px 28px',
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: 'hsl(140, 20%, 97%)',
  border: '1px solid hsl(140, 15%, 89%)',
  borderRadius: '12px',
}

const eyebrow = {
  margin: '0 0 12px',
  color: 'hsl(160, 60%, 40%)',
  fontSize: '12px',
  fontWeight: '700' as const,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
}

const h1 = {
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: 'hsl(160, 30%, 10%)',
  margin: '0 0 18px',
}

const text = {
  fontSize: '15px',
  color: 'hsl(160, 10%, 45%)',
  lineHeight: '1.7',
  margin: '0 0 18px',
}

const panel = {
  margin: '0 0 24px',
  padding: '14px 16px',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: '1px solid hsl(140, 15%, 89%)',
}

const panelText = {
  margin: '0',
  color: 'hsl(160, 30%, 15%)',
  fontSize: '14px',
  fontWeight: '600' as const,
}

const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
