import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface OnboardingNotificationProps {
  submissionId?: string
  businessName?: string
  contactName?: string
  contactEmail?: string
  summary?: Record<string, any>
}

const OnboardingNotificationEmail = ({
  submissionId,
  businessName,
  contactName,
  contactEmail,
  summary = {},
}: OnboardingNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New onboarding completed: {businessName || contactName || 'New client'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>NEW CLIENT ONBOARDING</Text>
        <Heading style={h1}>
          {contactName ? `${contactName}` : 'A new client'}
          {businessName ? <span style={{ color: '#96876F', fontStyle: 'italic' }}> · {businessName}</span> : null}
        </Heading>
        <Text style={text}>
          Just completed the AI OS onboarding flow. Below is the captured summary.
        </Text>

        <Hr style={divider} />

        <Section>
          <Text style={label}>CONTACT</Text>
          <Text style={value}>{contactEmail || 'Not provided'}</Text>
        </Section>

        <Section>
          <Text style={label}>WHAT THEY DO</Text>
          <Text style={value}>{summary.what_they_do || 'Not specified'}</Text>
        </Section>

        <Section>
          <Text style={label}>BRAND VOICE</Text>
          <Text style={value}>{summary.brand_voice || 'Not specified'}</Text>
        </Section>

        <Section>
          <Text style={label}>IDEAL CUSTOMER</Text>
          <Text style={value}>{summary.ideal_customer || 'Not specified'}</Text>
        </Section>

        <Section>
          <Text style={label}>OFFERINGS</Text>
          <Text style={value}>{summary.offerings || 'Not specified'}</Text>
        </Section>

        <Section>
          <Text style={label}>BIGGEST CHALLENGES</Text>
          <Text style={value}>{summary.biggest_challenges || 'Not specified'}</Text>
        </Section>

        <Section>
          <Text style={label}>12-MONTH GOALS</Text>
          <Text style={value}>{summary.goals_12_months || 'Not specified'}</Text>
        </Section>

        <Hr style={divider} />

        <Text style={footer}>
          Submission ID: {submissionId}<br />
          {SITE_NAME} · Onboarding System
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OnboardingNotificationEmail,
  subject: (data: Record<string, any>) =>
    `New onboarding: ${data.contactName || data.businessName || 'New client'}`,
  displayName: 'Owner: new onboarding notification',
  previewData: {
    submissionId: 'sample-id',
    businessName: 'Aurora Skincare',
    contactName: 'Mira Chen',
    contactEmail: 'mira@aurora.co',
    summary: {
      what_they_do: 'Independent skincare line focused on botanical formulations.',
      brand_voice: 'Quiet, confident, sensorial.',
      ideal_customer: 'Women 28-45 who value ritual.',
      offerings: 'Three-product core line, $48-$120.',
      biggest_challenges: 'Manual customer support and content creation.',
      goals_12_months: 'Reach 5k subscribers and automate fulfillment notifications.',
    },
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Cormorant Garamond', Georgia, serif",
}
const container = { padding: '48px 32px', maxWidth: '560px', margin: '0 auto' }
const eyebrow = {
  fontSize: '11px',
  letterSpacing: '0.3em',
  color: '#96876F',
  margin: '0 0 16px',
  fontFamily: "'Karla', Arial, sans-serif",
}
const h1 = {
  fontSize: '28px',
  fontWeight: '300' as const,
  color: '#1C1A17',
  lineHeight: '1.3',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.7',
  fontFamily: "'Karla', Arial, sans-serif",
}
const label = {
  fontSize: '10px',
  letterSpacing: '0.25em',
  color: '#96876F',
  margin: '20px 0 6px',
  fontFamily: "'Karla', Arial, sans-serif",
}
const value = {
  fontSize: '14px',
  color: '#1C1A17',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: "'Karla', Arial, sans-serif",
}
const divider = { borderTop: '1px solid #E8E2DA', margin: '24px 0' }
const footer = {
  fontSize: '11px',
  color: '#9E9689',
  margin: '24px 0 0',
  fontFamily: "'Karla', Arial, sans-serif",
}
