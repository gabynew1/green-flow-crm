/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GreenGrass'

interface ProjectItem {
  name?: string
  quantity?: number | string
}

interface ProjectReportProps {
  contractName?: string
  propertyName?: string
  providerName?: string
  contractItems?: ProjectItem[]
  adhocItems?: ProjectItem[]
  contractTotal?: string
  adhocTotal?: string
  grandTotal?: string
  reviewUrl?: string
}

const ItemList = ({ items }: { items: ProjectItem[] }) => (
  <>
    {items.map((it, i) => (
      <Text key={i} style={panelDetail}>
        • {it.name || 'Serviciu'}{it.quantity ? ` × ${it.quantity}` : ''}
      </Text>
    ))}
  </>
)

const ProjectReportEmail = ({
  contractName, propertyName, providerName,
  contractItems = [], adhocItems = [],
  contractTotal, adhocTotal, grandTotal, reviewUrl,
}: ProjectReportProps) => (
  <Html lang="ro" dir="ltr">
    <Head />
    <Preview>Raport de finalizare proiect</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{SITE_NAME}</Text>
        <Heading style={h1}>Proiect finalizat</Heading>
        <Text style={text}>
          {providerName ? `${providerName} a` : 'Furnizorul dumneavoastră a'} finalizat proiectul
          {contractName ? ` „${contractName}”` : ''}{propertyName ? ` la ${propertyName}` : ''}.
        </Text>

        {contractItems.length > 0 && (
          <Section style={panel}>
            <Text style={panelText}>Servicii din contract</Text>
            <ItemList items={contractItems} />
            {contractTotal && <Text style={panelTotal}>Subtotal: {contractTotal}</Text>}
          </Section>
        )}

        {adhocItems.length > 0 && (
          <Section style={panel}>
            <Text style={panelText}>Servicii suplimentare (în afara contractului)</Text>
            <ItemList items={adhocItems} />
            {adhocTotal && <Text style={panelTotal}>Subtotal: {adhocTotal}</Text>}
          </Section>
        )}

        <Hr />
        {grandTotal && <Text style={grand}>Total general: {grandTotal}</Text>}

        {reviewUrl && <Button style={button} href={reviewUrl}>Vezi proiectul</Button>}
        <Text style={footer}>Notificare automată din platforma {SITE_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProjectReportEmail,
  subject: (data: Record<string, any>) =>
    data.contractName ? `Proiect finalizat: ${data.contractName}` : 'Proiect finalizat',
  displayName: 'Project completion report',
  previewData: {
    contractName: 'Amenajare grădină',
    propertyName: 'Vila Rozelor',
    providerName: 'GreenScape SRL',
    contractItems: [{ name: 'Plantare gazon', quantity: 1 }],
    adhocItems: [{ name: 'Tăiere arbore', quantity: 2 }],
    contractTotal: '4.500 RON',
    adhocTotal: '600 RON',
    grandTotal: '5.100 RON',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", padding: '24px 12px' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto', backgroundColor: 'hsl(140, 20%, 97%)', border: '1px solid hsl(140, 15%, 89%)', borderRadius: '12px' }
const eyebrow = { margin: '0 0 12px', color: 'hsl(160, 60%, 40%)', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(160, 10%, 45%)', lineHeight: '1.7', margin: '0 0 18px' }
const panel = { margin: '0 0 18px', padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid hsl(140, 15%, 89%)' }
const panelText = { margin: '0 0 8px', color: 'hsl(160, 30%, 15%)', fontSize: '15px', fontWeight: '600' as const }
const panelDetail = { margin: '0 0 4px', color: 'hsl(160, 10%, 45%)', fontSize: '13px' }
const panelTotal = { margin: '8px 0 0', color: 'hsl(160, 30%, 15%)', fontSize: '13px', fontWeight: '600' as const }
const grand = { fontSize: '17px', fontWeight: 'bold' as const, color: 'hsl(160, 30%, 10%)', margin: '12px 0 20px' }
const button = { backgroundColor: 'hsl(160, 60%, 40%)', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: 'hsl(160, 10%, 45%)', margin: '28px 0 0' }