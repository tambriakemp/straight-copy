import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

/**
 * "Your proposal is ready to review."
 *
 * This is the email that did not exist. Uploading a proposal marked it `sent`
 * and told nobody — no mail, no SureContact activity, no send date — so a
 * document could sit in a client's portal for two weeks while our own records
 * said it had gone out. Every follow-up measured from a date that was never
 * written.
 *
 * Deliberately short. The proposal is the pitch; this is the doorbell.
 */
interface ProposalReadyProps {
  recipientName?: string
  projectName?: string
  proposalTitle?: string
  portalUrl: string
  fromName?: string
  /** Optional line from whoever sent it, above the button. */
  note?: string | null
}

const ProposalReadyEmail = ({
  recipientName, projectName, proposalTitle, portalUrl, fromName, note,
}: ProposalReadyProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${proposalTitle ?? 'Your proposal'} is ready for you to review`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>✦</Text>
        <Heading style={h1}>
          {recipientName ? `Hi ${recipientName},` : 'Hello,'}
        </Heading>
        <Text style={text}>
          {fromName ? `${fromName} has put together a proposal for you` : 'A proposal is ready for you'}
          {projectName ? ` for ${projectName}` : ''}. You can read it in your
          portal, and sign it there when you are ready.
        </Text>

        {note && <Text style={text}>{note}</Text>}

        <Section style={card}>
          <Text style={cardLabel}>Proposal</Text>
          <Text style={cardTitle}>{proposalTitle ?? 'Your proposal'}</Text>
          {projectName && <Text style={cardMeta}>{projectName}</Text>}
        </Section>

        <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
          <Button href={portalUrl} style={button}>
            Review the proposal
          </Button>
        </Section>

        <Text style={smallText}>
          Or open this link in your browser:<br />
          <Link href={portalUrl} style={link}>{portalUrl}</Link>
        </Text>

        <Text style={text}>
          If anything in it is unclear or not quite right, reply to this email
          and we will work it through — nothing is fixed until you sign it.
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
  component: ProposalReadyEmail,
  subject: (d: Record<string, unknown>) =>
    `${(d?.proposalTitle as string) ?? 'Your proposal'} — ready for your review`,
  displayName: 'Proposal ready to review',
  previewData: {
    recipientName: 'Dr. Kahin',
    projectName: 'Menovia Marketing',
    proposalTitle: 'Menovia — App Growth Retainer',
    portalUrl: 'https://cre8visions.com/portal/abc/projects/def',
    fromName: 'CRE8 Visions',
    note: null,
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
const cardTitle = { fontSize: '22px', color: '#1C1A17', margin: '0 0 4px', fontWeight: '400' as const, lineHeight: '1.3' }
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
