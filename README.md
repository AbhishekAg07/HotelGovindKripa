# Hotel Govind Kripa Website

Clean full-stack hotel website with a separated frontend and backend.

## Project Structure

```text
frontend/   Public HTML, CSS, browser JavaScript, and images
backend/    Node API server, environment config, storage, and dependencies
```

## Run Locally

From the project root:

```powershell
npm.cmd install
npm.cmd start
```

Open:

- Public site: `http://localhost:8787`
- Admin dashboard: `http://localhost:8787/admin.html`
- Health check: `http://localhost:8787/api/health`

Run checks:

```powershell
npm.cmd run check
```

## Configuration

Backend environment files live in `backend/`.

```powershell
Copy-Item backend\.env.example backend\.env
```

Important variables:

- `PORT`: server port, defaults to `8787`
- `ADMIN_KEY`: required for admin dashboard access
- `MONGODB_URI`: production database connection string
- `TRUST_PROXY`: set to `true` only when deployed behind a trusted proxy such as Render
- `HOTEL_EMAIL`: recipient for booking and inquiry notifications
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: recommended email delivery on Render free services
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`: optional SMTP settings

Without `MONGODB_URI`, local development uses JSON files in `backend/data/`. Do not use JSON fallback for production traffic.

## Deploy Frontend on Vercel

Deploy only the `frontend/` directory to Vercel.

- Root directory: `frontend`
- Framework preset: Other
- Build command: leave empty
- Output directory: `.`
- Install command: leave empty

Before deploying the frontend, set the Render backend URL in `frontend/config.js`:

```js
window.HOTEL_API_BASE = "https://your-render-backend.onrender.com";
```

After deployment, open:

- Public site: `https://your-vercel-frontend.vercel.app/`
- Admin dashboard: `https://your-vercel-frontend.vercel.app/admin.html`

## Deploy Backend on Render

Deploy only the `backend/` directory as a Render Web Service.

- Root directory: `backend`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`

Set environment variables in Render from `backend/.env.example`, especially:

- `ADMIN_KEY`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `ALLOWED_ORIGINS`
- `TRUST_PROXY=true`
- `HOTEL_EMAIL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

Use MongoDB Atlas or another MongoDB database in production. Render can restart services, so MongoDB is safer than relying on local JSON files for production traffic.

For email on Render free services, prefer `RESEND_API_KEY` because outbound SMTP ports are blocked on free web services. SMTP settings can still be used locally or on hosting plans that allow SMTP traffic.

After deployment, test:

```text
https://your-render-backend.onrender.com/api/health
```

After Vercel gives you the live frontend URL, add that exact URL to the backend `ALLOWED_ORIGINS` environment variable in Render, then redeploy the backend.
