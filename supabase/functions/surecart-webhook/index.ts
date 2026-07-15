// SureCart webhook → create onboarding invite + email link
// Public endpoint (verify_jwt = false). Verifies SureCart signature.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { seedWebDevTasks } from '../_shared/web-dev-tasks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp, x-surecart-signature',
}


// Map SureCart product IDs → tier. Edit these to match your SureCart products.
// Anything not listed defaults to "launch".
const PRODUCT_TIER_MAP: Record<string, 'launch' | 'growth'> = {
  '4e9d2ca6-2011-4541-9a45-b02291d76abf': 'launch',
  'b23d2c69-5584-434f-8589-cc27acaa6cba': 'growth',
}

const WEB_DEV_PRODUCT_ID = '5b5d573d-f503-4966-bdd8-9b054eca6856'

const SITE_URL = 'https://cre8visions.com'

function randomToken(len = 20) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(
    bytes,
    (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]
  ).join('')
}

// Try to pull a subscription id out of an order payload (line_items[].subscription)
function firstSubscriptionFromOrder(data: any): string {
  const items =
    data?.line_items?.data ||
    data?.line_items ||
    data?.checkout?.line_items?.data ||
    []
  if (!Array.isArray(items)) return ''
  for (const it of items) {
    const sid = it?.subscription?.id || it?.subscription_id || it?.subscription
    if (typeof sid === 'string' && sid) return sid
  }
  return ''
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false
  // SureCart sends an HMAC-SHA256 hex digest of the raw body
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const bytes = new Uint8Array(sigBytes)
  const expectedHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  // base64
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const expectedB64 = btoa(bin)
  const expectedB64Url = expectedB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const expectedAll = [expectedHex, expectedB64, expectedB64Url]

  // SureCart header may be `t=...,v1=...`, base64, or hex. Try all.
  const candidates: string[] = []
  if (signatureHeader.includes('=') && signatureHeader.includes(',')) {
    for (const part of signatureHeader.split(',')) {
      const [k, v] = part.trim().split('=')
      if (k && v && k.toLowerCase().startsWith('v')) candidates.push(v)
    }
  }
  candidates.push(signatureHeader.trim())

  const matched = candidates.some((c) => expectedAll.some((e) => timingSafeEqual(c, e)))
  if (!matched) {
    const h = signatureHeader.trim()
    const preview = h.length > 8 ? `${h.slice(0, 4)}…${h.slice(-4)}` : '(short)'
    console.warn(`SureCart sig mismatch. header_len=${h.length} preview=${preview}`)
  }
  return matched
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  const webhookSecret = Deno.env.get('SURECART_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('SURECART_WEBHOOK_SECRET not configured')
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rawBody = await req.text()
  const signature =
    req.headers.get('x-surecart-signature') ||
    req.headers.get('surecart-signature')

  const valid = await verifySignature(rawBody, signature, webhookSecret)
  if (!valid) {
    console.warn('Invalid SureCart signature')
    return new Response(JSON.stringify({ error: 'invalid_signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const eventType: string = event?.type || event?.event || ''
  const isPaid =
    eventType === 'order.paid' ||
    eventType === 'checkout.completed' ||
    eventType === 'checkout.paid' ||
    eventType === 'invoice.paid'
  const isSubscriptionEvent = eventType.startsWith('subscription.')

  // Subscription lifecycle events: keep clients.subscription_status in sync.
  if (isSubscriptionEvent) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const sub = event?.data?.object || event?.data || event
    const subId: string = sub?.id || sub?.subscription_id || ''
    if (!subId) {
      return new Response(JSON.stringify({ ok: true, ignored: 'no_sub_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const status: string = sub?.status || (eventType.endsWith('.canceled') ? 'canceled' : 'active')
    const cancelAtPeriodEnd: boolean = !!sub?.cancel_at_period_end
    const canceledAtSec: number | null = sub?.canceled_at ?? null
    const cpEndSec: number | null = sub?.current_period_end_at ?? sub?.current_period_end ?? null
    const toIso = (s: number | null) =>
      s ? new Date((s > 1e12 ? s : s * 1000)).toISOString() : null
    const { error: upErr } = await supabase
      .from('clients')
      .update({
        subscription_status: status,
        subscription_cancel_at_period_end: cancelAtPeriodEnd,
        subscription_canceled_at: toIso(canceledAtSec),
        subscription_current_period_end: toIso(cpEndSec),
      })
      .eq('surecart_subscription_id', subId)
    if (upErr) console.error('Subscription sync error', upErr)
    return new Response(JSON.stringify({ ok: true, synced: subId, status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!isPaid) {
    return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Extract from payload (SureCart shape)
  const data = event?.data?.object || event?.data || event
  const orderId: string =
    data?.order?.id ||
    data?.order_id ||
    data?.id ||
    data?.checkout?.id ||
    ''
  const orderNumber: string | number =
    data?.number || data?.order_number || orderId

  // ---- project_invoices match (paid event) ----
  // SureCart fires order.paid / checkout.paid / invoice.paid; we look up the
  // project_invoices row by either checkout id, invoice id, or order id and
  // mark it paid. Idempotent on repeated events.
  try {
    const supabaseInv = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const checkoutId: string =
      data?.checkout?.id || data?.checkout_id ||
      (eventType.startsWith('checkout.') ? data?.id : '') || ''
    const invoiceId: string =
      data?.invoice?.id || data?.invoice_id ||
      (eventType.startsWith('invoice.') ? data?.id : '') || ''
    const ors: string[] = []
    if (checkoutId) ors.push(`surecart_checkout_id.eq.${checkoutId}`)
    if (invoiceId) ors.push(`surecart_invoice_id.eq.${invoiceId}`)
    if (orderId) ors.push(`surecart_order_id.eq.${orderId}`)
    if (ors.length) {
      const { data: invRow } = await supabaseInv
        .from('project_invoices')
        .select('id, status')
        .or(ors.join(','))
        .maybeSingle()
      if (invRow) {
        if (invRow.status !== 'paid') {
          await supabaseInv.from('project_invoices').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            surecart_order_id: orderId || null,
            surecart_checkout_id: checkoutId || undefined,
            surecart_invoice_id: invoiceId || undefined,
          }).eq('id', invRow.id)
        }
        return new Response(JSON.stringify({ ok: true, project_invoice_paid: invRow.id }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
  } catch (e) {
    console.error('project_invoices match error', e)
  }


  // Customer
  const customer = data?.customer || data?.checkout?.customer || {}
  const email: string =
    customer?.email || data?.email || data?.checkout?.email || ''
  const firstName: string =
    customer?.first_name || data?.first_name || data?.checkout?.first_name || ''
  const lastName: string =
    customer?.last_name || data?.last_name || data?.checkout?.last_name || ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  // Subscription + customer IDs (SureCart shapes vary across event types)
  const customerId: string =
    customer?.id ||
    data?.customer_id ||
    data?.checkout?.customer?.id ||
    ''
  const subscriptionId: string =
    data?.subscription?.id ||
    data?.subscription_id ||
    firstSubscriptionFromOrder(data) ||
    ''

  // Product → tier (look at first line item)
  const lineItems =
    data?.line_items?.data ||
    data?.line_items ||
    data?.checkout?.line_items?.data ||
    []
  const firstItem = Array.isArray(lineItems) ? lineItems[0] : null
  const productId: string =
    firstItem?.price?.product?.id ||
    firstItem?.product?.id ||
    firstItem?.product ||
    ''
  const tier: 'launch' | 'growth' = PRODUCT_TIER_MAP[productId] || 'launch'

  // --- Web Development product: create/attach a web_development project, no invite/email ---
  if (productId === WEB_DEV_PRODUCT_ID) {
    if (!email) {
      console.error('Web Dev order missing email', { orderId })
      return new Response(JSON.stringify({ error: 'no_email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Idempotency: project already created for this order?
    if (orderId) {
      const { data: existingProj } = await supabase
        .from('client_projects')
        .select('id, client_id')
        .eq('source_order_id', orderId)
        .maybeSingle()
      if (existingProj) {
        return new Response(JSON.stringify({
          ok: true, web_dev: true, reused_project: true,
          client_id: existingProj.client_id, project_id: existingProj.id,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Find client by clients.contact_email
    let clientId: string | null = null
    let reusedClient = false
    const { data: directClient } = await supabase
      .from('clients')
      .select('id, archived')
      .ilike('contact_email', email)
      .order('archived', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (directClient) {
      clientId = directClient.id
      reusedClient = true
    } else {
      // Try client_contacts.email
      const { data: contactRow } = await supabase
        .from('client_contacts')
        .select('client_id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      if (contactRow?.client_id) {
        clientId = contactRow.client_id
        reusedClient = true
      }
    }

    // Create client if no match
    if (!clientId) {
      const companyName: string =
        customer?.company || data?.company || data?.checkout?.company || ''
      const phone: string =
        customer?.phone || data?.phone || data?.checkout?.phone || ''
      const { data: newClient, error: newClientErr } = await supabase
        .from('clients')
        .insert({
          business_name: companyName || null,
          contact_name: fullName || null,
          contact_email: email,
          contact_phone: phone || null,
          tier: 'launch',
          pipeline_stage: 'intake_submitted',
          surecart_order_id: orderId || null,
          surecart_customer_id: customerId || null,
        })
        .select('id')
        .single()
      if (newClientErr || !newClient) {
        console.error('Web Dev: failed to create client', newClientErr)
        return new Response(JSON.stringify({ error: 'client_insert_failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      clientId = newClient.id
    }

    // Determine project name
    const displayName = fullName || (directClient ? '' : '') || 'Client'
    // Pull business_name for naming if we reused a client
    let nameLabel = fullName
    if (reusedClient) {
      const { data: c } = await supabase
        .from('clients')
        .select('contact_name, business_name')
        .eq('id', clientId)
        .maybeSingle()
      nameLabel = c?.contact_name || c?.business_name || fullName || 'Client'
    }
    const projectName = `Web Development - ${nameLabel || displayName}`

    const { data: newProject, error: projErr } = await supabase
      .from('client_projects')
      .insert({
        client_id: clientId,
        type: 'web_development',
        name: projectName,
        status: 'active',
        notes: `Auto-created from SureCart order #${orderNumber}`,
        source_order_id: orderId || null,
      })
      .select('id')
      .single()
    if (projErr || !newProject) {
      console.error('Web Dev: failed to create project', projErr)
      return new Response(JSON.stringify({ error: 'project_insert_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Seed full Web Dev task backlog (7 epics, 50 tasks). Non-fatal on error.
    try {
      const seed = await seedWebDevTasks(supabase, newProject.id)
      console.log('Web Dev: seed result', seed)
    } catch (e) {
      console.error('Web Dev: seedWebDevTasks failed', e)
    }

    return new Response(JSON.stringify({
      ok: true, web_dev: true,
      client_id: clientId, project_id: newProject.id, reused_client: reusedClient,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }


  if (!email) {
    console.error('No email on SureCart payload', { orderId })
    return new Response(JSON.stringify({ error: 'no_email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Idempotency: check for existing invite by source_order_id
  const { data: existing } = await supabase
    .from('onboarding_invites')
    .select('id, token')
    .eq('source_order_id', orderId)
    .maybeSingle()

  let token: string
  let inviteId: string

  if (existing) {
    token = existing.token
    inviteId = existing.id
    console.log('Reusing existing invite for order', orderId)
    // Backfill subscription IDs in case they were missing on the first event
    if (subscriptionId || customerId) {
      await supabase
        .from('onboarding_invites')
        .update({
          surecart_subscription_id: subscriptionId || null,
          surecart_customer_id: customerId || null,
        })
        .eq('id', inviteId)
    }
  } else {
    token = randomToken(20)
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
    const { data: created, error: insertErr } = await supabase
      .from('onboarding_invites')
      .insert({
        token,
        contact_name: fullName || null,
        contact_email: email,
        tier,
        source_order_id: orderId,
        surecart_subscription_id: subscriptionId || null,
        surecart_customer_id: customerId || null,
        note: `Auto-created from SureCart order #${orderNumber}`,
        expires_at: expiresAt,
      })
      .select('id, token')
      .single()
    if (insertErr || !created) {
      console.error('Failed to create invite', insertErr)
      return new Response(JSON.stringify({ error: 'insert_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    inviteId = created.id
  }

  // If a client already exists for this email (re-purchase, manual creation,
  // or the trigger ran from a previous onboarding), copy the subscription IDs
  // onto it so the cancel button works.
  if (subscriptionId) {
    await supabase
      .from('clients')
      .update({
        surecart_subscription_id: subscriptionId,
        surecart_customer_id: customerId || null,
        surecart_order_id: orderId || null,
        subscription_status: 'active',
        subscription_canceled_at: null,
        subscription_cancel_at_period_end: false,
      })
      .eq('contact_email', email)
      .is('surecart_subscription_id', null)
  }

  const inviteUrl = `${SITE_URL}/onboarding?invite=${token}`

  // Send the branded email (idempotency key keyed on order + template)
  try {
    const { error: emailErr } = await supabase.functions.invoke(
      'send-transactional-email',
      {
        body: {
          templateName: 'onboarding-invite',
          recipientEmail: email,
          idempotencyKey: `onboarding-invite-${orderId}`,
          templateData: {
            name: firstName || fullName || null,
            tier,
            inviteUrl,
          },
        },
      }
    )
    if (emailErr) console.error('Email send error', emailErr)
  } catch (e) {
    console.error('Email invoke threw', e)
  }

  return new Response(
    JSON.stringify({ ok: true, invite_id: inviteId, invite_url: inviteUrl }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
