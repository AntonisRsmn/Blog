# Blog Platform (ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ)

Node/Express + MongoDB blog platform with public pages, admin workflows, analytics, cookies consent, and Brevo newsletter integration.

## Stack

- Backend: Node.js, Express, Mongoose
- Frontend: Static HTML/CSS/JS
- Database: MongoDB Atlas
- Newsletter: Brevo API + webhook sync

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`.

3. Start server:

```bash
npm start
```

Default port is `4000` (with fallback ports if busy).

## Required Environment Variables

- `MONGO_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`

## Newsletter (Brevo) Setup

Set in `.env`:

- `BREVO_API_KEY`
- `BREVO_LIST_ID`
- `BREVO_WEBHOOK_SECRET`

Webhook endpoint:

- `POST /api/newsletter/webhook/brevo`

Validation endpoint:

- `GET /api/newsletter/webhook/brevo`

Recommended Brevo events:

- `unsubscribed`
- `spam`
- `contact_deleted`

Webhook URL format:

```text
https://YOUR_DOMAIN/api/newsletter/webhook/brevo?secret=YOUR_BREVO_WEBHOOK_SECRET
```

## Testing Webhook Before Final Domain

Use ngrok:

```bash
ngrok http 4000
```

Then configure Brevo with the generated HTTPS URL.

You can also test locally:

```bash
curl -X POST "http://localhost:4000/api/newsletter/webhook/brevo?secret=YOUR_BREVO_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"unsubscribed","email":"test@example.com"}'
```

Expected response pattern:

```json
{"ok":true,"received":1,"processed":1,"removed":0,"ignored":0}
```

## Notes

- Requests with duplicate slashes (for example `//api/newsletter/...`) are normalized server-side.
- Legal pages support EL/EN switching and render one language block at a time.
- See `PRE_HANDOFF_CHECKLIST.md` before deployment handoff.
