/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface OfferResponseProps {
  offerName?: string
  propertyName?: string
  clientName?: string
  response?: 'accepted' | 'rejected'
  rejectionComment?: string
}

const OfferResponseEmail = ({ offerName, propertyName, clientName, response, rejectionComment }: OfferResponseProps) => {
  const isAccepted = response === 'accepted'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Offer {isAccepted ? 'accepted' : 'rejected'} by {clientName || 'client'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{SITE_NAME}</Text>
          <Heading style={h1}>Offer {isAccepted ? 'Accepted ✅' : 'Rejected ❌'}</Heading>
          <Text style={text}>
            {clientName || 'Your client'} has <strong>{isAccepted ? 'accepted' : 'rejected'}</strong> the offer.
          </Text>
          <Section style={panel}>
            {offerName && <Text style={panelText}>📋 {offerName}</Text>}
            {propertyName && <Text style={panelDetail}>Property: {propertyName}</Text>}
          </Section>
          {!isAccepted && rejectionComment && (
            <Section style={rejectPanel}>
              <Text style={panelText}>Rejection reason:</Text>
              <Text style={panelDetail}>"{rejectionComment}"</Text>
            </Section>
          )}
          <Text style={text}>
            {isAccepted ? 'A draft contract has been automatically created. Review and send it to the client.' : 'You can edit the offer and resend it, or contact the client.'}
          </Text>
          <Text style={footer}>This is an automated notification from the {SITE_NAME} platform.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OfferResponseEmail,
  subject: (data: Record<string, any>) => `Offer ${data.response === 'accepted' ? 'accepted' : 'rejected'}: ${data.offerName || 'Offer'}`,
  displayName: 'Offer client response',
  previewData: { offerName: 'Amenajare Grădină', propertyName: 'Vila Rozelor', clientName: 'Ion Popescu', response: 'accepted' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 16px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const rejectPanel = { margin: '0 0 24px', padding: '14px 16px', backgroundColor: 'hsl(0, 70%, 97%)', borderRadius: '12px', border: '1px solid hsl(0, 50%, 89%)' }
const panelText = { margin: '0 0 4px', color: 'hsl(160, 30%, 15%)', fontSize: '15px', fontWeight: '600' as const }
const panelDetail = { margin: '0', color: 'hsl(160, 10%, 45%)', fontSize: '13px' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
