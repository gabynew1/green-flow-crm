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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to GreenGrass — confirm your email to get growing</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>GreenGrass</Text>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for joining{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Confirm{' '}
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>{' '}
          to activate your workspace and start managing customers, visits, and offers.
        </Text>
        <Container style={panel}>
          <Text style={panelText}>One click and you’re in.</Text>
        </Container>
        <Button style={button} href={confirmationUrl}>
          Verify my email
        </Button>
        <Text style={footer}>
          If you didn&apos;t create an account, you can safely ignore this message.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
