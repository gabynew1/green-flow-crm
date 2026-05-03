/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface PasswordResetProps {
  resetUrl: string
  expiresInMinutes?: number
}

const PasswordResetEmail = ({ resetUrl, expiresInMinutes = 60 }: PasswordResetProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {SITE_NAME} password securely</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your password for {SITE_NAME}. Click the button below to choose a new one and get back into your account.
        </Text>
        <Container style={panel}>
          <Text style={panelText}>For your security, this link expires in {expiresInMinutes} minutes and can only be used once.</Text>
        </Container>
        <Button style={button} href={resetUrl}>
          Reset Password
        </Button>
        <Text style={footer}>
          If you didn&apos;t request a password reset, you can safely ignore this email — your password will stay the same.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PasswordResetEmail,
  subject: 'Reset your GreenGrass password',
  displayName: 'Password reset',
  previewData: { resetUrl: 'https://greengrasscrm.ro/reset-password?token=preview', expiresInMinutes: 60 },
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

const button = {
  backgroundColor: 'hsl(160, 60%, 40%)',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '999px',
  textDecoration: 'none',
  fontWeight: '600' as const,
  fontSize: '15px',
  display: 'inline-block',
}

const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }