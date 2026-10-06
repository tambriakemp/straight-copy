import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

/** Short, deliberately — the receipt is SureCart's job. This just confirms
 *  it landed and says what happens next, so a payment never lands in
 *  silence on the client's side. */
interface InvoicePaidClientProps {
  recipientName?: string
  projectName?: string
  invoiceLabel?: string
  amountFormatted?: string
  fromName?: string
}

const InvoicePaidClientEmail = ({
  recipientName, projectName, invoiceLabel, amountFormatted, fromName,
}: InvoicePaidClientProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Payment received${invoiceLabel ? ` — ${invoiceLabel}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>✦</Text>
        <Heading style={h1}>
          {recipientName ? `Thank you, ${recipientName}.` : 'Thank you.'}
        </Heading>
        <Text style={text}>
          We received your payment{amountFormatted ? ` of ${amountFormatted}` : ''}
          {invoiceLabel ? ` for ${invoiceLabel}` : ''}{projectName ? ` on ${projectName}` : ''}.
        </Text>
        <Section style={card}>
          <Text style={cardText}>
            We are moving ahead with the next step on our end and will be in touch
            shortly with what to expect.
          </Text>
        </Section>
        <Text style={text}>
          Questions in the meantime? Just reply to this email.
        </Text>

        <Hr style={divider} />
        <Text style={footer}>
          — The {fromName ?? SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoicePaidClientEmail,
  subject: () => 'Payment received',
  displayName: 'Invoice paid — client confirmation',
  previewData: {
    recipientName: 'Alex',
    projectName: 'Menovia',
    invoiceLabel: 'Deposit',
    amountFormatted: '$2,000.00',
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
  border: '1px solid #E8E2DA', borderRadius: '8px', padding: '18px 22px', margin: '20px 0',
  backgroundColor: '#FBF9F5',
}
const cardText = { fontSize: '14px', color: '#1C1A17', lineHeight: '1.6', margin: 0, fontFamily: "'Karla', Arial, sans-serif" }
const divider = { borderTop: '1px solid #E8E2DA', margin: '28px 0' }
const footer = { fontSize: '13px', color: '#9E9689', margin: '20px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
