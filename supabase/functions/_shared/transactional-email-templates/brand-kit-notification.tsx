import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface BrandKitNotificationProps {
  clientId?: string
  businessName?: string
  contactName?: string
  contactEmail?: string
  intake?: Record<string, any>
}

const fmt = (v: any): string => {
  if (v == null || v === "") return "Not provided"
  if (Array.isArray(v)) return v.length ? v.join(", ") : "Not provided"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

const BrandKitNotificationEmail = ({
  clientId,
  businessName,
  contactName,
  contactEmail,
  intake = {},
}: BrandKitNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Brand Kit intake submitted: {businessName || contactName || 'Client'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>NEW BRAND KIT INTAKE</Text>
        <Heading style={h1}>
          {contactName || 'Client'}
          {businessName ? <span style={{ color: '#96876F', fontStyle: 'italic' }}> · {businessName}</span> : null}
        </Heading>
        <Text style={text}>
          Just submitted their Brand Kit intake via the client portal. Below is the captured response.
        </Text>

        <Hr style={divider} />

        <Section>
          <Text style={label}>CONTACT</Text>
          <Text style={value}>{contactEmail || 'Not provided'}</Text>
        </Section>

        <Section>
          <Text style={label}>LOGO / EXISTING MARKS</Text>
          <Text style={value}>{fmt(intake.logo)}</Text>
        </Section>

        <Section>
          <Text style={label}>COLOR DIRECTION</Text>
          <Text style={value}>{fmt(intake.colors)}</Text>
        </Section>

        <Section>
          <Text style={label}>TYPOGRAPHY</Text>
          <Text style={value}>{fmt(intake.typography)}</Text>
        </Section>

        <Section>
          <Text style={label}>VISUAL REFERENCES / MOODBOARD</Text>
          <Text style={value}>{fmt(intake.references)}</Text>
        </Section>

        <Section>
          <Text style={label}>VISUAL DO'S</Text>
          <Text style={value}>{fmt(intake.dos)}</Text>
        </Section>

        <Section>
          <Text style={label}>VISUAL DON'TS</Text>
          <Text style={value}>{fmt(intake.donts)}</Text>
        </Section>

        <Section>
          <Text style={label}>FILE FORMAT NEEDS</Text>
          <Text style={value}>{fmt(intake.formats)}</Text>
        </Section>

        <Section>
          <Text style={label}>DELIVERABLE SCOPE</Text>
          <Text style={value}>{fmt(intake.scope)}</Text>
        </Section>

        {intake.notes ? (
          <Section>
            <Text style={label}>ADDITIONAL NOTES</Text>
            <Text style={value}>{fmt(intake.notes)}</Text>
          </Section>
        ) : null}

        <Hr style={divider} />

        <Text style={footer}>
          Client ID: {clientId}<br />
          {SITE_NAME} · Client Portal
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BrandKitNotificationEmail,
  subject: (data: Record<string, any>) =>
    `Brand Kit intake: ${data.contactName || data.businessName || 'New client'}`,
  displayName: 'Owner: brand kit intake submitted',
  previewData: {
    clientId: 'sample-client-id',
    businessName: 'Aurora Skincare',
    contactName: 'Mira Chen',
    contactEmail: 'mira@aurora.co',
    intake: {
      logo: 'Has a wordmark, no icon yet — wants both.',
      colors: 'Soft sage, cream, deep terracotta accent.',
      typography: 'Editorial serif for headlines, quiet sans for body.',
      references: 'Aesop, Le Labo packaging, Cereal Magazine layouts.',
      dos: 'Generous whitespace, muted tones, slow pace.',
      donts: 'Neon, bold gradients, stock photography.',
      formats: 'SVG, PNG, PDF brand guidelines.',
      scope: 'Logo suite, color tokens, type system, 1-page guideline doc.',
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
