import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

/**
 * "{Client} signed {proposal}." Fires every time, success or not — if the
 * deposit invoice failed to send, or the proposal had no commercial terms to
 * build a schedule from, this is the one place that says so and tells Bree
 * exactly what to do about it. A signature that goes through with no note at
 * all is the failure this template exists to prevent.
 */
interface ProposalSignedAdminProps {
  clientName?: string
  proposalTitle?: string
  adminUrl: string
  hasTerms: boolean
  depositStatus: 'sent' | 'failed' | 'none'
  depositAmountFormatted?: string | null
  errorDetail?: string | null
}

const ProposalSignedAdminEmail = ({
  clientName, proposalTitle, adminUrl, hasTerms, depositStatus, depositAmountFormatted, errorDetail,
}: ProposalSignedAdminProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${clientName ?? 'A client'} signed ${proposalTitle ?? 'a proposal'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>SIGNED</Text>
        <Heading style={h1}>
          {clientName ?? 'A client'} signed {proposalTitle ?? 'a proposal'}
        </Heading>

        {!hasTerms && (
          <Text style={warn}>
            This proposal has no commercial terms, so no payment schedule or deposit
            invoice was created. Set up pricing on the proposal, then add a payment
            schedule from Payments.
          </Text>
        )}

        {hasTerms && depositStatus === 'sent' && (
          <Text style={text}>
            The deposit invoice{depositAmountFormatted ? ` for ${depositAmountFormatted}` : ''} went
            out to the client automatically through SureCart.
          </Text>
        )}

        {hasTerms && depositStatus === 'failed' && (
          <Text style={warn}>
            The deposit invoice failed to send{errorDetail ? `: ${errorDetail}` : ''}. Send
            it by hand from the project's Payments panel.
          </Text>
        )}

        <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
          <Button href={adminUrl} style={button}>
            Open in admin
          </Button>
        </Section>

        <Hr style={divider} />
        <Text style={footer}>
          {SITE_NAME} · Proposals
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProposalSignedAdminEmail,
  subject: (d: Record<string, any>) =>
    `${(d?.clientName as string) ?? 'A client'} signed ${(d?.proposalTitle as string) ?? 'a proposal'}`,
  displayName: 'Owner: proposal signed',
  previewData: {
    clientName: 'Dr. Kahin',
    proposalTitle: 'Menovia — App Growth Retainer',
    adminUrl: 'https://cre8visions.com/admin/clients/abc/projects/def',
    hasTerms: true,
    depositStatus: 'sent',
    depositAmountFormatted: '$2,000.00',
    errorDetail: null,
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
const warn = {
  fontSize: '14px', color: '#8a4a1f', lineHeight: '1.7', fontFamily: "'Karla', Arial, sans-serif",
  margin: '0 0 12px', padding: '12px 14px', border: '1px solid #E8C9A8', borderRadius: '6px',
  backgroundColor: '#FBF2E6',
}
const button = {
  backgroundColor: '#1C1A17', color: '#ffffff', padding: '14px 32px', borderRadius: '4px',
  fontSize: '14px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, textDecoration: 'none',
  fontFamily: "'Karla', Arial, sans-serif",
}
const divider = { borderTop: '1px solid #E8E2DA', margin: '24px 0' }
const footer = { fontSize: '11px', color: '#9E9689', margin: '24px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
