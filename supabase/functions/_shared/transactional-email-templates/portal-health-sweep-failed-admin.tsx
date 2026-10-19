import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface PortalHealthSweepFailedAdminProps {
  failedProjects?: string
  detail?: string
  attempts?: number
}

const PortalHealthSweepFailedAdminEmail = ({ failedProjects, detail, attempts }: PortalHealthSweepFailedAdminProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Agency Portal list_tasks is still failing after automatic retries</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>PORTAL HEALTH SWEEP</Text>
        <Heading style={h1}>list_tasks is still failing after automatic retries</Heading>
        <Text style={text}>
          The scheduled portal-health-sweep job retried {attempts ?? 3} times and list_tasks
          is still failing for: {failedProjects ?? 'unknown project(s)'}. This needs a human
          look — it is not something the sweep can recover from on its own.
        </Text>
        <Section style={codeBox}>
          <Text style={codeText}>{detail ?? 'No further detail.'}</Text>
        </Section>
        <Hr style={divider} />
        <Text style={footer}>
          {SITE_NAME} · Agency Portal health sweep (CRE-535)
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PortalHealthSweepFailedAdminEmail,
  subject: () => 'Agency Portal list_tasks still failing after automatic retries',
  to: 'hello@cre8visions.com',
  displayName: 'Owner: Agency Portal list_tasks sweep failed',
  previewData: {
    failedProjects: 'Menovia.ai (b4b9e8ae-...)',
    detail: 'Menovia.ai: timed out after 8000ms',
    attempts: 3,
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
const codeBox = { backgroundColor: '#F6F3EE', borderRadius: '4px', padding: '12px 16px', margin: '0 0 16px' }
const codeText = { fontSize: '12px', color: '#1C1A17', fontFamily: "'Courier New', monospace", margin: 0, whiteSpace: 'pre-wrap' as const }
const divider = { borderTop: '1px solid #E8E2DA', margin: '24px 0' }
const footer = { fontSize: '11px', color: '#9E9689', margin: '24px 0 0', fontFamily: "'Karla', Arial, sans-serif" }
