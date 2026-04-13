import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "CRE8 Visions"

interface ContactConfirmationProps {
  name?: string
}

const ContactConfirmationEmail = ({ name }: ContactConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Thank you for reaching out to {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>✦</Text>
        <Heading style={h1}>
          {name ? `Thank you, ${name}.` : 'Thank you for reaching out.'}
        </Heading>
        <Text style={text}>
          We've received your inquiry and our team will be in touch within 24 hours
          with next steps and a free discovery call invite.
        </Text>
        <Hr style={divider} />
        <Text style={text}>
          In the meantime, feel free to explore our latest work at{' '}
          <Link href="https://cre8visions.com/work" style={link}>
            cre8visions.com
          </Link>.
        </Text>
        <Text style={footer}>
          Warm regards,<br />
          The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactConfirmationEmail,
  subject: 'We received your inquiry — CRE8 Visions',
  displayName: 'Contact form confirmation',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
}

const container = {
  padding: '48px 32px',
  maxWidth: '520px',
  margin: '0 auto',
}

const eyebrow = {
  fontSize: '36px',
  color: '#96876F',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}

const h1 = {
  fontSize: '28px',
  fontWeight: '300' as const,
  color: '#1C1A17',
  lineHeight: '1.3',
  margin: '0 0 24px',
}

const text = {
  fontSize: '15px',
  color: '#55575d',
  lineHeight: '1.8',
  margin: '0 0 20px',
  fontFamily: "'Karla', Arial, sans-serif",
}

const link = {
  color: '#96876F',
  textDecoration: 'underline',
}

const divider = {
  borderTop: '1px solid #E8E2DA',
  margin: '28px 0',
}

const footer = {
  fontSize: '13px',
  color: '#9E9689',
  lineHeight: '1.6',
  margin: '32px 0 0',
  fontFamily: "'Karla', Arial, sans-serif",
}
