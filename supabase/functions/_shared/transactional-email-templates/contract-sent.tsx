/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface ContractSentProps {
  contractName?: string
  propertyName?: string
  providerName?: string
  reviewUrl?: string
}

const ContractSentEmail = ({ contractName, propertyName, providerName, reviewUrl }: ContractSentProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New contract ready for your review</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Contract Ready for Review</Heading>
        <Text style={text}>
          {providerName ? `${providerName} has` : 'Your provider has'} sent you a new contract for review.
        </Text>
        <Section style={panel}>
          {contractName && <Text style={panelText}>📄 {contractName}</Text>}
          {propertyName && <Text style={panelDetail}>Property: {propertyName}</Text>}
        </Section>
        <Text style={text}>
          Please review the contract details and accept or reject it at your earliest convenience.
        </Text>
        {reviewUrl && (
          <Button style={button} href={reviewUrl}>Review Contract</Button>
        )}
        <Text style={footer}>This is an automated notification from the {SITE_NAME} platform.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContractSentEmail,
  subject: (data: Record<string, any>) => data.contractName ? `Contract: ${data.contractName}` : 'New contract for your review',
  displayName: 'Contract sent to client',
  previewData: { contractName: 'Întreținere Grădină 2026', propertyName: 'Vila Rozelor', providerName: 'GreenScape SRL' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 24px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const panelText = { margin: '0 0 4px', color: 'hsl(160, 30%, 15%)', fontSize: '15px', fontWeight: '600' as const }
const panelDetail = { margin: '0', color: 'hsl(160, 10%, 45%)', fontSize: '13px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
