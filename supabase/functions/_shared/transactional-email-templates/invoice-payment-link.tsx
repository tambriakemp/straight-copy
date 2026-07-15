import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface InvoicePaymentLinkProps {
  recipientName?: string
  projectName?: string
  invoiceLabel?: string
  amountFormatted?: string
  dueDateFormatted?: string | null
  payUrl: string
  fromName?: string
}

const InvoicePaymentLinkEmail = ({
  recipientName, projectName, invoiceLabel, amountFormatted, dueDateFormatted, payUrl, fromName,
}: InvoicePaymentLinkProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Payment link for ${invoiceLabel ?? 'your invoice'}${amountFormatted ? ` — ${amountFormatted}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>✦</Text>
        <Heading style={h1}>
          {recipientName ? `Hi ${recipientName},` : 'Hello,'}
        </Heading>
        <Text style={text}>
          {fromName ? `${fromName} shared a payment link with you` : 'A payment link has been shared with you'}
          {projectName ? ` for ${projectName}` : ''}.
        </Text>

        <Section style={card}>
          {invoiceLabel && <Text style={cardLabel}>{invoiceLabel}</Text>}
          {amountFormatted && <Text style={cardAmount}>{amountFormatted}</Text>}
          {dueDateFormatted && <Text style={cardMeta}>Due {dueDateFormatted}</Text>}
        </Section>

        <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
          <Button href={payUrl} style={button}>
            Pay invoice
          </Button>
        </Section>

        <Text style={smallText}>
          Or open this link in your browser:<br />
          <Link href={payUrl} style={link}>{payUrl}</Link>
        </Text>

        <Hr style={divider} />
        <Text style={footer}>
          — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoicePaymentLinkEmail,
  subject: (d: Record<string, any>) =>
    `Payment link${d?.invoiceLabel ? ` — ${d.invoiceLabel}` : ''}${d?.projectName ? ` (${d.projectName})` : ''}`,
  displayName: 'Invoice payment link',
  previewData: {
    recipientName: 'Alex',
    projectName: 'Menovia',
    invoiceLabel: 'Milestone 2',
    amountFormatted: '$5,000.00',
    dueDateFormatted: 'Nov 1, 2026',
    payUrl: 'https://example.com/pay/abc',
    fromName: 'CRE8 Visions',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
}
const container = { padding: '48px 32px', maxWidth: '540px', margin: '0 auto' }
const eyebrow = { fontSize: '36px', color: '#96876F', textAlign: 'center' as const, margin: '0 0 24px' }
const h1 = { fontSize: '26px', fontWeight: '300' as const, color: '#1C1A17', lineHeight: '1.3', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#55575d', lineHeight: '1.7', margin: '0 0 16px', fontFamily: "'Karla', Arial, sans-serif" }
const card = {
  border: '1px solid #E8E2DA', borderRadius: '8px', padding: '20px 24px', margin: '24px 0',
  backgroundColor: '#FBF9F5',
}
const cardLabel = { fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#96876F', margin: '0 0 8px', fontFamily: "'Karla', Arial, sans-serif" }
const cardAmount = { fontSize: '28px', color: '#1C1A17', margin: '0 0 4px', fontWeight: '400' as const }
const cardMeta = { fontSize: '13px', color: '#9E9689', margin: 0, fontFamily: "'Karla', Arial, sans-serif" }
const button = {
  backgroundColor: '#1C1A17', color: '#ffffff', padding: '14px 32px', borderRadius: '4px',
  fontSize: '14px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, textDecoration: 'none',
  fontFamily: "'Karla', Arial, sans-serif",
}
const smallText = { fontSize: '12px', color: '#9E9689', lineHeight: '1.6', margin: '16px 0 0', fontFamily: "'Karla', Arial, sans-serif", wordBreak: 'break-all' as const }
const link = { color: '#96876F', textDecoration: 'underline' }
const divider = { borderTop: '1px solid #E8E2DA', margin: '28px 0' }
const footer = { fontSize: '13px', color: '#9E9689', margin: '20px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
