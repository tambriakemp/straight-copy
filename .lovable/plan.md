

# Add Contact Form Confirmation Email

## Summary
The SureContact integration is working correctly. The missing piece is a confirmation email sent to the person who submits the contact form. The email domain (notify.launchely.com) is already verified and ready.

## Steps

### 1. Set up email infrastructure
Run the email infrastructure setup tool to create the database tables, queues, and cron job needed for email sending.

### 2. Scaffold transactional email system
Set up the transactional email Edge Functions (send-transactional-email, handle-email-unsubscribe, handle-email-suppression) and the template registry.

### 3. Create a branded confirmation email template
Create a React Email template (`contact-confirmation.tsx`) matching CRE8 Visions' brand style — dark/warm palette with serif typography. The email will thank the submitter by name and confirm the team will respond within 24 hours.

### 4. Register the template in the registry
Add the new template to the TEMPLATES map so the send function can find it.

### 5. Create an unsubscribe page
Add a branded unsubscribe page in the app (path determined by the scaffold tool) so recipients can opt out if needed.

### 6. Wire up the confirmation email in the contact form
Update `src/pages/Contact.tsx` to call `send-transactional-email` after the SureContact submission succeeds, passing the submitter's email and name.

### 7. Deploy all Edge Functions
Deploy the new and updated Edge Functions so everything is live.

## No changes to the SureContact flow
The existing SureContact integration will remain unchanged — this adds a confirmation email on top of it.

