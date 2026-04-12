

# Improve Service Field Data Sent to SureContact

## What's Already Working
The edge function already sends `service_interest` as a custom field to SureContact. SureContact automatically creates custom fields when it receives new field names for the first time.

## What to Improve
Currently the form sends short value keys like `"campaign"` or `"video"`. It would be better to send the full readable labels like `"AI Brand Campaign"` or `"Short-Form Video"` so the data is immediately useful in SureContact without needing to decode values.

## Changes

### 1. Update the Edge Function to map service values to labels
In `supabase/functions/submit-contact/index.ts`, add a mapping object:
```
campaign → "AI Brand Campaign"
lifestyle → "Editorial Lifestyle Content"
video → "Short-Form Video"
product → "Product Visualization"
retainer → "Monthly Retainer"
unsure → "Not Sure Yet"
```

Use this to send the readable label as `service_interest` instead of the raw value.

### 2. Redeploy and test
Deploy the updated function and test with a sample submission.

## No frontend changes needed
The Contact page form already sends the `service` field correctly.

