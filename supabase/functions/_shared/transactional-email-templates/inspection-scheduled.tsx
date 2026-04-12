/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface InspectionScheduledProps {
  inspectionTitle?: string
  propertyName?: string
  providerName?: string
  scheduledDate?: string
}

const InspectionScheduledEmail = ({ inspectionTitle, propertyName, providerName, scheduledDate }: InspectionScheduledProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Inspection scheduled for {propertyName || 'your property'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Inspection Scheduled</Heading>
        <Text style={text}>
          {providerName ? `${providerName} has` : 'Your provider has'} scheduled an inspection for your property.
        </Text>
        <Section style={panel}>
          {inspectionTitle && <Text style={panelText}>🔍 {inspectionTitle}</Text>}
          {propertyName && <Text style={panelDetail}>Property: {propertyName}</Text>}
          {scheduledDate && <Text style={panelDetail}>Date: {scheduledDate}</Text>}
        </Section>
        <Text style={text}>
          Please make sure the property is accessible on the scheduled date. If you need to reschedule, contact your service provider.
        </Text>
        <Text style={footer}>This is an automated notification from the {SITE_NAME} platform.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InspectionScheduledEmail,
  subject: (data: Record<string, any>) => `Inspection scheduled: ${data.propertyName || 'Your property'}`,
  displayName: 'Inspection scheduled',
  previewData: { inspectionTitle: 'Evaluare inițială', propertyName: 'Vila Rozelor', providerName: 'GreenScape SRL', scheduledDate: '2026-04-20' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 24px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const panelText = { margin: '0 0 4px', color: 'hsl(160, 30%, 15%)', fontSize: '15px', fontWeight: '600' as const }
const panelDetail = { margin: '0', color: 'hsl(160, 10%, 45%)', fontSize: '13px' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
