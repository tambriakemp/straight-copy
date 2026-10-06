/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as contactConfirmation } from './contact-confirmation.tsx'
import { template as onboardingNotification } from './onboarding-notification.tsx'
import { template as onboardingInvite } from './onboarding-invite.tsx'
import { template as brandKitNotification } from './brand-kit-notification.tsx'
import { template as webDevDiscoveryNotification } from './web-dev-discovery-notification.tsx'
import { template as invoicePaymentLink } from './invoice-payment-link.tsx'
import { template as proposalReady } from './proposal-ready.tsx'
import { template as proposalSignedClient } from './proposal-signed-client.tsx'
import { template as proposalSignedAdmin } from './proposal-signed-admin.tsx'
import { template as invoicePaidClient } from './invoice-paid-client.tsx'
import { template as invoicePaidAdmin } from './invoice-paid-admin.tsx'
import { template as surecontactSyncFailedAdmin } from './surecontact-sync-failed-admin.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'contact-confirmation': contactConfirmation,
  'onboarding-notification': onboardingNotification,
  'onboarding-invite': onboardingInvite,
  'brand-kit-notification': brandKitNotification,
  'web-dev-discovery-notification': webDevDiscoveryNotification,
  'invoice-payment-link': invoicePaymentLink,
  'proposal-ready': proposalReady,
  'proposal-signed-client': proposalSignedClient,
  'proposal-signed-admin': proposalSignedAdmin,
  'invoice-paid-client': invoicePaidClient,
  'invoice-paid-admin': invoicePaidAdmin,
  'surecontact-sync-failed-admin': surecontactSyncFailedAdmin,
}
