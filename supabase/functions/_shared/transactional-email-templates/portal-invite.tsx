import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'cre8visions'

interface PortalInviteProps {
  contactName?: string | null
  businessName?: string | null
  inviteUrl?: string
}

const PortalInviteEmail = ({
  contactName,
  businessName,
  inviteUrl = 'https://cre8visions.com/portal/login',
}: PortalInviteProps) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Set your password to access your client portal.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>cre8visions · client portal</Text>
          <Heading style={h1}>{greeting}</Heading>

          <Text style={text}>
            Your client portal{businessName ? ` for ${businessName}` : ''} now
            needs a password to sign in. Set one below to get back into your
            projects, proposals and files.
          </Text>

          <Section style={buttonWrap}>
            <Button href={inviteUrl} style={button}>
              Set your password
            </Button>
          </Section>

          <Text style={smallText}>
            Or paste this link into your browser:
            <br />
            <span style={linkText}>{inviteUrl}</span>
          </Text>

          <Text style={smallText}>This link can only be used once, in the browser you open it in.</Text>

          <Hr style={hr} />

          <Text style={footer}>
            With care,
            <br />
            The {SITE_NAME} team
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PortalInviteEmail,
  subject: (data: Record<string, any>) =>
    data?.businessName
      ? `Set your password for the ${data.businessName} portal`
      : 'Set your password for your cre8visions portal',
  displayName: 'Portal invite (first-time password setup)',
  previewData: {
    contactName: 'Jane',
    businessName: 'Studio Name',
    inviteUrl: 'https://cre8visions.com/portal/set-password#sample',
  },
} satisfies TemplateEntry

// ---- styles (editorial cream / ink, matching onboarding-invite) ----
const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: '#1a1a1a',
  margin: 0,
  padding: 0,
}
const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '48px 32px',
  backgroundColor: '#faf7f2',
}
const eyebrow: React.CSSProperties = {
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '11px',
  letterSpacing: '0.35em',
  textTransform: 'uppercase',
  color: '#8a7e6e',
  margin: '0 0 28px',
}
const h1: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '32px',
  lineHeight: '1.2',
  fontWeight: 400,
  color: '#1a1a1a',
  margin: '0 0 24px',
  fontStyle: 'italic',
}
const text: React.CSSProperties = {
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '14px',
  lineHeight: '1.7',
  color: '#3d3a35',
  margin: '0 0 18px',
}
const buttonWrap: React.CSSProperties = {
  margin: '32px 0 24px',
  textAlign: 'left',
}
const button: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  color: '#faf7f2',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '12px',
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  padding: '14px 28px',
  borderRadius: '0',
  display: 'inline-block',
}
const smallText: React.CSSProperties = {
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '12px',
  lineHeight: '1.6',
  color: '#8a7e6e',
  margin: '0 0 12px',
}
const linkText: React.CSSProperties = {
  color: '#3d3a35',
  wordBreak: 'break-all',
}
const hr: React.CSSProperties = {
  borderColor: '#e5dfd3',
  borderStyle: 'solid',
  borderWidth: '0 0 1px',
  margin: '32px 0 24px',
}
const footer: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '13px',
  fontStyle: 'italic',
  color: '#5a5248',
  margin: 0,
}
