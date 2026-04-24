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

interface OnboardingInviteProps {
  name?: string | null
  tier?: 'launch' | 'growth' | string | null
  inviteUrl?: string
}

const tierLabel = (t?: string | null) => {
  if (t === 'growth') return 'Growth'
  if (t === 'launch') return 'Launch'
  return ''
}

const OnboardingInviteEmail = ({
  name,
  tier,
  inviteUrl = 'https://cre8visions.com/onboarding',
}: OnboardingInviteProps) => {
  const greeting = name ? `Welcome, ${name}.` : 'Welcome.'
  const tierText = tierLabel(tier)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Your onboarding link is ready — pick up where you leave off, anytime.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>cre8visions · onboarding</Text>
          <Heading style={h1}>{greeting}</Heading>

          <Text style={text}>
            Thank you for joining{tierText ? ` the ${tierText} tier` : ' us'}.
            We're delighted to begin.
          </Text>

          <Text style={text}>
            Below is your private onboarding link. It opens a quiet,
            conversational intake — no forms, no pressure. Your progress saves
            automatically, so you can step away and return whenever it suits
            you.
          </Text>

          <Section style={buttonWrap}>
            <Button href={inviteUrl} style={button}>
              Begin onboarding
            </Button>
          </Section>

          <Text style={smallText}>
            Or paste this link into your browser:
            <br />
            <span style={linkText}>{inviteUrl}</span>
          </Text>

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
  component: OnboardingInviteEmail,
  subject: (data: Record<string, any>) =>
    data?.name
      ? `${data.name}, your cre8visions onboarding link`
      : 'Your cre8visions onboarding link',
  displayName: 'Onboarding invite (SureCart)',
  previewData: {
    name: 'Jane',
    tier: 'launch',
    inviteUrl: 'https://cre8visions.com/onboarding?invite=sample-token',
  },
} satisfies TemplateEntry

// ---- styles (editorial cream / ink) ----
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
  margin: '0 0 24px',
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
