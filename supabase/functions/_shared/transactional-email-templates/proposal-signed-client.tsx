import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

/**
 * The client's confirmation the moment they sign. Thanks them, hands over the
 * countersigned PDF, and tells them plainly whether a deposit invoice is on
 * its way or still needs to be set up on our side — never silence either way.
 */
interface ProposalSignedClientProps {
  recipientName?: string
  proposalTitle?: string
  signedPdfUrl?: string | null
  depositStatus: 'sent' | 'pending' | 'none'
  depositAmountFormatted?: string | null
  fromName?: string
}

const ProposalSignedClientEmail = ({
  recipientName, proposalTitle, signedPdfUrl, depositStatus, depositAmountFormatted, fromName,
}: ProposalSignedClientProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Thank you for signing ${proposalTitle ?? 'your proposal'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>✦</Text>
        <Heading style={h1}>
          {recipientName ? `Thank you, ${recipientName}.` : 'Thank you.'}
        </Heading>
        <Text style={text}>
          We have your signature on {proposalTitle ?? 'the proposal'}. A copy with both
          signatures is attached below for your records.
        </Text>

        {depositStatus === 'sent' && (
          <Text style={text}>
            {depositAmountFormatted
              ? `Your deposit invoice for ${depositAmountFormatted} is on its way to this inbox separately.`
              : 'Your deposit invoice is on its way to this inbox separately.'}
          </Text>
        )}
        {depositStatus === 'pending' && (
          <Text style={text}>
            We are finishing the deposit invoice on our end and it will follow shortly.
          </Text>
        )}

        {signedPdfUrl && (
          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button href={signedPdfUrl} style={button}>
              Download signed copy
            </Button>
          </Section>
        )}

        <Text style={text}>
          If anything in it needs a second look, just reply to this email.
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
  component: ProposalSignedClientEmail,
  subject: (d: Record<string, any>) =>
    `Thank you for signing ${(d?.proposalTitle as string) ?? 'your proposal'}`,
  displayName: 'Proposal signed — client thank you',
  previewData: {
    recipientName: 'Dr. Kahin',
    proposalTitle: 'Menovia — App Growth Retainer',
    signedPdfUrl: 'https://cre8visions.com/portal/abc/projects/def',
    depositStatus: 'sent',
    depositAmountFormatted: '$2,000.00',
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
const button = {
  backgroundColor: '#1C1A17', color: '#ffffff', padding: '14px 32px', borderRadius: '4px',
  fontSize: '14px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, textDecoration: 'none',
  fontFamily: "'Karla', Arial, sans-serif",
}
const divider = { borderTop: '1px solid #E8E2DA', margin: '28px 0' }
const footer = { fontSize: '13px', color: '#9E9689', margin: '20px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
