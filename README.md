# WhatsApp AI Support Bot

A WhatsApp chatbot built with Node.js and Supabase that recognizes returning
users, asks demographic questions on first contact, holds AI-powered
conversations with real memory, accepts and summarizes PDFs/images/files,
and is architected to handle many concurrent users via a Redis-backed queue.

---

## Features

- **Persistent memory** — every user is identified by their WhatsApp phone
  number; conversation history is stored in Postgres (Supabase) and fed
  back into every AI reply, so the bot remembers past conversations.
- **Demographic onboarding** — new users are asked a short set of questions
  (name, age, city, occupation) before reaching normal conversation.
- **AI replies with context** — powered by Groq (Llama/GPT-OSS models),
  grounded in the user's actual message history and known demographics.
- **File & PDF handling** — images, documents, audio, and video sent via
  WhatsApp are downloaded and stored in Supabase Storage. PDFs with a real
  text layer are automatically summarized (summary + key points/KPIs).
- **Built for concurrency** — the webhook only validates and enqueues
  incoming messages; a separate worker process (or several) does the
  actual Supabase/AI/WhatsApp work in parallel via BullMQ + Redis, so one
  slow reply never blocks another user.

---

## Architecture

```
WhatsApp User
   │  (message)
   ▼
Meta WhatsApp Cloud API
   │  (webhook POST)
   ▼
Express server (src/server.js)  ──▶  Redis Queue (BullMQ)  ──▶  Worker process(es)
   │  responds 200 immediately                                      │
   │                                                                 ▼
   │                                                    src/handlers/processMessage.js
   │                                                                 │
   │                                          ┌──────────────────────┼──────────────────────┐
   │                                          ▼                      ▼                      ▼
   │                                   Supabase Postgres      Groq (LLM)              Supabase Storage
   │                                   (users, messages,      AI replies /            (uploaded files/PDFs)
   │                                    files, conversations)  PDF summaries
   │                                                                 │
   └─────────────────────────────────────────────────────────────────▶ WhatsApp Cloud API (reply sent back)
```

The webhook (`src/server.js` + `src/routes/webhook.js`) and the worker
(`src/queue/worker.js`) are **two separate processes** that both need to be
running for the bot to actually reply — the webhook only queues jobs, it
never talks to Supabase, Groq, or sends replies itself.

---

## Tech stack

| Layer | Tool | Purpose |
|---|---|---|
| Messaging | [WhatsApp Cloud API](https://developers.facebook.com) (Meta) | Receiving and sending WhatsApp messages |
| Backend | Node.js + Express | Webhook server |
| Queue | [BullMQ](https://docs.bullmq.io) + [Upstash Redis](https://upstash.com) | Decouples webhook from processing; enables concurrency |
| Database | [Supabase](https://supabase.com) (Postgres) | User identity, conversation memory, onboarding state |
| File storage | Supabase Storage | Stores uploaded images/documents/PDFs |
| AI | [Groq](https://console.groq.com) (OpenAI-compatible API) | Chat replies and PDF summarization |
| PDF parsing | `pdf-parse` | Extracts text from PDFs before summarizing |
| Local tunneling (dev only) | [ngrok](https://ngrok.com) | Exposes localhost to Meta's webhook during development |

---

## Prerequisites

Accounts needed (all have free tiers used in this project):

1. Meta Developer account + a WhatsApp Business app (Cloud API test number)
2. Supabase project
3. Upstash Redis database
4. Groq API account
5. Node.js LTS installed locally
6. ngrok account (local development/testing only — not needed once deployed)

---

## Environment variables

Create a `.env` file in the project root (see `.env.example`):

| Variable | Where to get it | Notes |
|---|---|---|
| `PORT` | — | Defaults to 3000 |
| `WHATSAPP_VERIFY_TOKEN` | You choose it yourself | Must match exactly what you enter in Meta's webhook config |
| `WHATSAPP_TOKEN` | Meta App Dashboard → Use cases → Customize → API Setup | Temporary token expires ~24h; use a permanent System User token for production |
| `WHATSAPP_PHONE_NUMBER_ID` | Same API Setup page | Numeric ID, not the phone number itself |
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API | |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page | **Secret key** — full DB access, server-side only, never expose client-side |
| `GROQ_API_KEY` | console.groq.com/keys | Free tier |
| `REDIS_URL` | Upstash Dashboard → your database → Connect tab | Format: `rediss://default:XXXX@host:port` |

---

## Project structure

```
whatsapp-bot/
├── src/
│   ├── server.js                  # Express entry point (the webhook process)
│   ├── config.js                  # Loads all env vars in one place
│   ├── routes/
│   │   └── webhook.js             # GET verification + POST (validates & enqueues)
│   ├── queue/
│   │   ├── connection.js          # Shared Redis connection
│   │   ├── queue.js               # BullMQ queue definition (producer side)
│   │   └── worker.js              # BullMQ worker (the processing process)
│   ├── handlers/
│   │   └── processMessage.js      # All actual message-handling logic
│   └── services/
│       ├── whatsapp.js            # Send messages, download media
│       ├── supabase.js            # User/message/file DB operations
│       ├── ai.js                  # Groq calls: chat replies + PDF summaries
│       ├── pdf.js                 # PDF text extraction
│       └── onboarding.js          # Demographic question flow (state machine)
├── .env
└── package.json
```

---

## Setup & installation

```bash
npm install
cp .env.example .env
# then fill in .env with your real values (see table above)
```

Run the required SQL schema (users, conversations, messages, files tables)
in Supabase's SQL Editor, and create a **private** Storage bucket named
`user-files`.

---

## Running locally

You need **three things running at once** during local development:

```bash
# Terminal 1 — the webhook/web server
npm run dev

# Terminal 2 — the worker (does the actual processing)
npm run worker

# Terminal 3 — exposes localhost to Meta (dev only)
ngrok http 3000
```

Then, in Meta Dashboard → Configuration → Webhook: set the Callback URL to
`<your-ngrok-url>/webhook` and the Verify Token to match `WHATSAPP_VERIFY_TOKEN`,
click **Verify and Save**, then subscribe to the `messages` field.

> ⚠️ ngrok's free-tier URL changes every time you restart it — you'll need
> to re-paste it into Meta's webhook config each session. The temporary
> WhatsApp token also expires roughly every 24h and needs regenerating.
> Both of these go away once deployed with a permanent domain and a
> permanent System User token.

---

## How a conversation works (user's perspective)

1. **First contact** — a new user sends any message (e.g. "Hi") to the
   business number. The bot doesn't try to answer it yet — it greets them
   and asks the first onboarding question instead.
2. **Demographics** — the user answers a short sequence of questions (name,
   age, city, occupation). Each answer is saved and the next question is
   asked automatically, until onboarding is marked complete.
3. **Normal AI conversation** — once onboarded, every message goes to the
   AI, which replies using the user's full stored conversation history
   (and known demographics) as context. This is what makes the bot
   "remember" the user across sessions — it's keyed entirely on their
   WhatsApp number, no login required.
4. **Sending a file, image, or PDF** — at any point, the user can send a
   document/image/audio/video. It's downloaded and stored in Supabase
   Storage. If it's a PDF with real text (not a scanned image), the bot
   extracts the text and replies with an AI-generated summary and key
   points/KPIs. Other file types get a simple acknowledgement.

---

## Known limitations / not yet built

- Scanned/photographed PDFs (no real text layer) aren't summarized — that
  needs OCR or a vision-capable model, which isn't implemented yet.
- The bot can't answer follow-up questions about a PDF's contents after
  summarizing it — only the summary is saved, not the full extracted text.
- The bot can only send free-form replies to users who message it first
  (standard WhatsApp policy) — it can't proactively message someone new
  without an approved message template.
- Currently uses the temporary 24h WhatsApp access token — needs to be
  swapped for a permanent System User token before real production use.
- Not yet deployed — currently designed to run locally with ngrok during
  development; deploying the two processes (web + worker) to a host like
  Railway removes the need for ngrok and the laptop staying on.

---

## Roadmap ideas

- Permanent WhatsApp access token (System User) to remove the 24h expiry
- Deploy web + worker processes to a real host (e.g. Railway)
- Store full extracted PDF text so users can ask follow-up questions
- OCR / vision-model support for scanned PDFs and images
- Structured data extraction from documents (e.g. invoice fields as JSON)
- Rate limiting tuned to the WhatsApp number's actual messaging tier
- Multi-language support
