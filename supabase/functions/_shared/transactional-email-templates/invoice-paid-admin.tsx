import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface InvoicePaidAdminProps {
  clientName?: string
  projectName?: string
  invoiceLabel?: string
  amountFormatted?: string
  adminUrl: string
}

const InvoicePaidAdminEmail = ({
  clientName, projectName, invoiceLabel, amountFormatted, adminUrl,
}: InvoicePaidAdminProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clientName ?? 'A client'} paid${amountFormatted ? ` ${amountFormatted}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>PAID</Text>
        <Heading style={h1}>
          {clientName ?? 'A client'} paid {amountFormatted ?? 'an invoice'}
        </Heading>
        <Text style={text}>
          {invoiceLabel ?? 'Invoice'}{projectName ? ` on ${projectName}` : ''} is marked paid.
          A kickoff item was logged for it.
        </Text>

        <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
          <Button href={adminUrl} style={button}>
            Open in admin
          </Button>
        </Section>

        <Hr style={divider} />
        <Text style={footer}>
          {SITE_NAME} · Payments
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoicePaidAdminEmail,
  subject: (d: Record<string, any>) =>
    `${(d?.clientName as string) ?? 'A client'} paid${d?.amountFormatted ? ` ${d.amountFormatted}` : ''}`,
  displayName: 'Owner: invoice paid',
  previewData: {
    clientName: 'Dr. Kahin',
    projectName: 'Menovia',
    invoiceLabel: 'Deposit',
    amountFormatted: '$2,000.00',
    adminUrl: 'https://cre8visions.com/admin/clients/abc/projects/def',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Cormorant Garamond', Georgia, serif",
}
const container = { padding: '48px 32px', maxWidth: '560px', margin: '0 auto' }
const eyebrow = {
  fontSize: '11px', letterSpacing: '0.3em', color: '#96876F', margin: '0 0 16px',
  fontFamily: "'Karla', Arial, sans-serif",
}
const h1 = { fontSize: '26px', fontWeight: '300' as const, color: '#1C1A17', lineHeight: '1.3', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.7', fontFamily: "'Karla', Arial, sans-serif", margin: '0 0 12px' }
const button = {
  backgroundColor: '#1C1A17', color: '#ffffff', padding: '14px 32px', borderRadius: '4px',
  fontSize: '14px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, textDecoration: 'none',
  fontFamily: "'Karla', Arial, sans-serif",
}
const divider = { borderTop: '1px solid #E8E2DA', margin: '24px 0' }
const footer = { fontSize: '11px', color: '#9E9689', margin: '24px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
