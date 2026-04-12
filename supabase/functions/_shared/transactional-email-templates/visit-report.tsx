/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface VisitReportProps {
  propertyName?: string
  providerName?: string
  performedDate?: string
  summary?: string
  reviewUrl?: string
  contractServicesCount?: number
  adHocServicesCount?: number
  hasAdditionalCost?: boolean
  adHocServicesList?: string
}

const VisitReportEmail = ({ propertyName, providerName, performedDate, summary, reviewUrl, contractServicesCount, adHocServicesCount, hasAdditionalCost, adHocServicesList }: VisitReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Service visit completed for {propertyName || 'your property'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Service Visit Completed</Heading>
        <Text style={text}>
          {providerName ? `${providerName} has` : 'Your provider has'} completed a service visit for your property.
        </Text>
        <Section style={panel}>
          {propertyName && <Text style={panelText}>🏡 {propertyName}</Text>}
          {performedDate && <Text style={panelDetail}>Date: {performedDate}</Text>}
        </Section>
        {summary && (
          <Section style={summaryPanel}>
            <Text style={panelText}>Summary:</Text>
            <Text style={panelDetail}>{summary}</Text>
          </Section>
        )}
        {/* Billing section */}
        <Section style={billingPanel}>
          <Text style={panelText}>💰 Billing</Text>
          {(contractServicesCount ?? 0) > 0 && (
            <Text style={panelDetail}>✓ {contractServicesCount} service(s) covered by your contract — no additional charge</Text>
          )}
          {hasAdditionalCost ? (
            <Text style={billingWarning}>⚠ {adHocServicesCount} additional service(s) will be billed separately{adHocServicesList ? `: ${adHocServicesList}` : ''}</Text>
          ) : (
            <Text style={billingCovered}>✓ All services are fully covered by your contract</Text>
          )}
        </Section>
        {reviewUrl && (
          <Button style={button} href={reviewUrl}>View Visit Details</Button>
        )}
        <Text style={footer}>This is an automated notification from the {SITE_NAME} platform.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VisitReportEmail,
  subject: (data: Record<string, any>) => `Visit completed: ${data.propertyName || 'Your property'}`,
  displayName: 'Visit completed — sent to client',
  previewData: { propertyName: 'Vila Rozelor', providerName: 'GreenScape SRL', performedDate: '2026-04-10', summary: 'Lawn mowed, hedges trimmed, flower beds weeded.', contractServicesCount: 3, adHocServicesCount: 1, hasAdditionalCost: true, adHocServicesList: 'Tree pruning' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 16px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const summaryPanel = { margin: '0 0 16px', padding: '14px 16px', backgroundColor: 'hsl(43, 90%, 97%)', borderRadius: '12px', border: '1px solid hsl(43, 60%, 85%)' }
const billingPanel = { margin: '0 0 24px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const panelText = { margin: '0 0 4px', color: 'hsl(160, 30%, 15%)', fontSize: '15px', fontWeight: '600' as const }
const panelDetail = { margin: '0 0 4px', color: 'hsl(160, 10%, 45%)', fontSize: '13px', lineHeight: '1.6' }
const billingWarning = { margin: '4px 0 0', color: 'hsl(35, 80%, 45%)', fontSize: '13px', fontWeight: '500' as const, lineHeight: '1.6' }
const billingCovered = { margin: '4px 0 0', color: 'hsl(160, 60%, 35%)', fontSize: '13px', fontWeight: '500' as const, lineHeight: '1.6' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }
