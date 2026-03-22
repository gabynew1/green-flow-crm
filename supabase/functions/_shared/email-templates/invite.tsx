/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You’ve been invited to join GreenGrass</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>GreenGrass</Text>
        <Heading style={h1}>You&apos;ve been invited</Heading>
        <Text style={text}>
          You&apos;ve been invited to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Accept the invitation below to create your account and step into the platform.
        </Text>
        <Container style={panel}>
          <Text style={panelText}>Your team is waiting for you.</Text>
        </Container>
        <Button style={button} href={confirmationUrl}>
          Accept Invitation
        </Button>
        <Text style={footer}>
          If you weren&apos;t expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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

const link = { color: 'hsl(160, 60%, 40%)', textDecoration: 'underline' }

const button = {
  backgroundColor: 'hsl(160, 60%, 40%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '700',
  borderRadius: '12px',
  padding: '14px 22px',
  textDecoration: 'none',
}

const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
