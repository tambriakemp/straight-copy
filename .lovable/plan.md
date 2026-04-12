

# Connect Contact Form to SureContact API

## Overview
Create a Supabase Edge Function that receives form data from the Contact page and forwards it to the SureContact API. The API key will be stored securely as a runtime secret.

## Steps

### 1. Enable Lovable Cloud
Lovable Cloud is needed to deploy Edge Functions. We'll ensure it's set up.

### 2. Store SureContact API key as a secret
We'll use the secrets tool to prompt you to add your SureContact API key securely (it will only be accessible server-side in the Edge Function).

### 3. Create Edge Function: `submit-contact`
A new Edge Function at `supabase/functions/submit-contact/index.ts` that:
- Accepts POST requests with the form fields (firstName, lastName, email, brand, service, message)
- Validates input with Zod
- Forwards the data to the SureContact API endpoint
- Returns success/error response with proper CORS headers

You'll need to provide the SureContact API endpoint URL and the expected request format (or we can look it up).

### 4. Update Contact page form submission
Modify `src/pages/Contact.tsx` to:
- Call the Edge Function via `supabase.functions.invoke('submit-contact', { body: form })`
- Show loading state during submission
- Handle success (show confirmation) and error (show toast) responses
- Set up the Supabase client integration if not already present

### 5. Add Supabase client config
Create `src/integrations/supabase/client.ts` with the project URL and anon key so the frontend can call the Edge Function.

## What I need from you
- Your **SureContact API endpoint URL** (e.g., `https://api.surecontact.com/v1/contacts`)
- The **expected request body format** for SureContact (field names, any required headers beyond the API key)

