import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface Props {
  clientId?: string
  projectId?: string | null
  businessName?: string
  contactName?: string
  contactEmail?: string
  summary?: string
  messageCount?: number
}

const WebDevDiscoveryNotification = ({
  clientId,
  projectId,
  businessName,
  contactName,
  contactEmail,
  summary,
  messageCount,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Web Dev discovery complete: {businessName || contactName || 'Client'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>WEB DEV DISCOVERY COMPLETE</Text>
        <Heading style={h1}>
          {contactName || 'Client'}
          {businessName ? <span style={{ color: '#96876F', fontStyle: 'italic' }}> · {businessName}</span> : null}
        </Heading>
        <Text style={text}>
          The discovery questionnaire chat is complete. Review the full transcript below and
          plan the design direction. The client expects a first look within 48 hours.
        </Text>

        <Hr style={divider} />

        <Section>
          <Text style={label}>CONTACT</Text>
          <Text style={value}>{contactEmail || 'Not provided'}</Text>
        </Section>

        <Section>
          <Text style={label}>CONVERSATION ({messageCount ?? 0} messages)</Text>
          <Text style={transcript}>{summary || 'No transcript available.'}</Text>
        </Section>

        <Hr style={divider} />

        <Text style={footer}>
          Client ID: {clientId}<br />
          {projectId ? <>Project ID: {projectId}<br /></> : null}
          {SITE_NAME} · Client Portal
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WebDevDiscoveryNotification,
  subject: (data: Record<string, any>) =>
    `Web Dev discovery: ${data.contactName || data.businessName || 'New client'}`,
  displayName: 'Owner: web dev discovery chat completed',
  previewData: {
    clientId: 'sample-client-id',
    projectId: 'sample-project-id',
    businessName: 'Aurora Skincare',
    contactName: 'Mira Chen',
    contactEmail: 'mira@aurora.co',
    messageCount: 24,
    summary:
      'Cre8 Visions AI: Hey Mira! ...\n\nClient: We make clean skincare for sensitive skin...',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Cormorant Garamond', Georgia, serif" }
const container = { padding: '48px 32px', maxWidth: '640px', margin: '0 auto' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.3em', color: '#96876F', margin: '0 0 16px', fontFamily: "'Karla', Arial, sans-serif" }
const h1 = { fontSize: '28px', fontWeight: '300' as const, color: '#1C1A17', lineHeight: '1.3', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.7', fontFamily: "'Karla', Arial, sans-serif" }
const label = { fontSize: '10px', letterSpacing: '0.25em', color: '#96876F', margin: '20px 0 6px', fontFamily: "'Karla', Arial, sans-serif" }
const value = { fontSize: '14px', color: '#1C1A17', lineHeight: '1.6', margin: '0', fontFamily: "'Karla', Arial, sans-serif" }
const transcript = { fontSize: '13px', color: '#1C1A17', lineHeight: '1.7', margin: '0', fontFamily: "'Karla', Arial, sans-serif", whiteSpace: 'pre-wrap' as const }
const divider = { borderTop: '1px solid #E8E2DA', margin: '24px 0' }
const footer = { fontSize: '11px', color: '#9E9689', margin: '24px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
