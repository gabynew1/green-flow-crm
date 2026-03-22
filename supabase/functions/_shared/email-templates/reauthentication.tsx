/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your GreenGrass verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>GreenGrass</Text>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Container style={codeWrap}>
          <Text style={codeStyle}>{token}</Text>
        </Container>
        <Text style={footer}>
          This code expires shortly. If you didn&apos;t request this, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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

const codeWrap = {
  margin: '0 0 24px',
  padding: '18px 16px',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: '1px solid hsl(140, 15%, 89%)',
  textAlign: 'center' as const,
}

const codeStyle = {
  fontFamily: "'Courier New', monospace",
  fontSize: '30px',
  fontWeight: 'bold' as const,
  color: 'hsl(160, 30%, 10%)',
  margin: '0',
  letterSpacing: '0.18em',
}

const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
