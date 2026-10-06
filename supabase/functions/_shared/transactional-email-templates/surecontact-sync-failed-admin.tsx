import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface SureContactSyncFailedAdminProps {
  context?: string
  detail?: string
}

const SureContactSyncFailedAdminEmail = ({ context, detail }: SureContactSyncFailedAdminProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`SureContact deal sync failed${context ? ` — ${context}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>SYNC FAILED</Text>
        <Heading style={h1}>The SureContact pipeline sync didn't go through</Heading>
        <Text style={text}>
          {context ?? 'A proposal or deal event'} could not be synced to the SureContact Sales
          Pipeline. Nothing about the proposal, the invoice, or the client-facing emails was
          affected — this is sales-pipeline tracking only.
        </Text>
        <Section style={codeBox}>
          <Text style={codeText}>{detail ?? 'No further detail.'}</Text>
        </Section>
        <Text style={text}>
          The deal in SureContact is now out of step with this proposal until someone fixes the
          underlying problem and it syncs again on the next send, signature, or decline.
        </Text>
        <Hr style={divider} />
        <Text style={footer}>
          {SITE_NAME} · Sales pipeline sync
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SureContactSyncFailedAdminEmail,
  subject: (d: Record<string, any>) =>
    `SureContact sync failed${d?.context ? ` — ${d.context}` : ''}`,
  displayName: 'Owner: SureContact deal sync failed',
  previewData: {
    context: 'proposal-sent-8b685031-2aa8-4c93-8391-f7af3a595de1',
    detail: 'Create deal failed: SureContact 422 — pipeline_stage_uuid invalid',
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
