# ⚡ pickNdrop

> Secure, self-destructing file sharing — chunked S3 multipart uploads, password protection, one-time links, IP controls, custom TTL, QR codes, and download audit logs.

![stack](https://img.shields.io/badge/React-Vite-61dafb?style=flat-square&logo=react)
![stack](https://img.shields.io/badge/Express-Node.js-339933?style=flat-square&logo=node.js)
![stack](https://img.shields.io/badge/AWS-S3-FF9900?style=flat-square&logo=amazonaws)
![stack](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat-square&logo=supabase)
![deploy](https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&logo=vercel)

---

## Features

| Feature | Description |
|---|---|
| 🔀 **Chunked upload** | 5 MB chunks via S3 multipart — browser uploads directly to S3 |
| 🔒 **Password protection** | bcrypt-hashed passphrase per link |
| ⚡ **One-time links** | File self-destructs after first download |
| 🌐 **IP whitelist/blacklist** | Restrict who can download by IP |
| ⏰ **Custom TTL** | 1h / 24h / 7d or custom datetime expiry |
| 📋 **Download audit log** | IP, user agent, timestamp per download |
| 📱 **QR code** | Instant QR for every share link |

---

## Architecture

```
Browser ──► POST /api/upload/init   ──► Express ──► S3 CreateMultipartUpload
        ──► POST /api/upload/sign   ──► Express ──► S3 PresignURL per chunk
        ──► PUT  <presigned URL>    ──────────────► S3 directly (bypasses Vercel!)
        ──► POST /api/upload/complete ─► Express ──► S3 Complete + Supabase insert
        ◄── { token, shareUrl, qrDataUrl }

Recipient ──► GET /api/download/:token ──► TTL / IP / password / one-time checks
           ◄── presigned S3 GET URL (15 min)
```

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/KhushiRajj/pickNdrop.git
cd pickNdrop
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --workspace=client
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --workspace=server
```

### 2. Environment Variables

```bash
cp .env.example server/.env
# Fill in your AWS + Supabase credentials
```

### 3. Supabase Schema

Run `supabase/schema.sql` in your Supabase SQL Editor.

### 4. S3 CORS Policy

In your S3 bucket → Permissions → CORS, paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:5173", "https://your-app.vercel.app"],
    "ExposeHeaders": ["ETag"]
  }
]
```

> ⚠️ The `ETag` header **must** be exposed — it's required to complete the multipart upload.

### 5. Run Locally

```bash
# Terminal 1 — backend
cd server && node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev

# Terminal 2 — frontend
cd client && node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

Frontend: http://localhost:5173  
API: http://localhost:3001

---

## Deploy to Vercel

1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables (from `.env.example`) in Vercel dashboard
4. Set `BASE_URL` to your Vercel URL
5. Deploy ✅

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/upload/init` | Start S3 multipart, returns `uploadId` + `s3Key` |
| `POST` | `/api/upload/sign` | Get presigned PUT URLs for chunk parts |
| `POST` | `/api/upload/complete` | Finalize upload, create share link, return token + QR |
| `POST` | `/api/upload/abort` | Cancel and clean up a multipart upload |
| `GET`  | `/api/download/info/:token` | Get link metadata (filename, TTL, hasPassword) |
| `GET`  | `/api/download/:token` | Download gate — returns presigned S3 GET URL |
| `POST` | `/api/download/:token/verify` | Verify password |
| `GET`  | `/api/download/log/:token` | Fetch audit log |

---

## Increment Roadmap

- [x] **Increment 1** — Core: chunked upload, QR, TTL download
- [ ] **Increment 2** — Security: password, one-time, IP filter  
- [ ] **Increment 3** — Polish: audit UI, resumable uploads, cron expiry