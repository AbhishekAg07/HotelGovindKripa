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
- `HOTEL_EMAIL`: recipient for booking and inquiry notifications
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`: optional SMTP settings

Without `MONGODB_URI`, local development uses JSON files in `backend/data/`. Do not use JSON fallback for production traffic.

## Deploy Backend on Vercel

Deploy only the `backend/` directory to Vercel.

- Root directory: `backend`
- Framework preset: Other
- Build command: leave empty or use `npm install`
- Output directory: leave empty
- Install command: `npm install`

Set environment variables in Vercel from `backend/.env.example`, especially:

- `ADMIN_KEY`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `ALLOWED_ORIGINS`
- `HOTEL_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

Use MongoDB Atlas or another MongoDB database in production. Vercel serverless functions do not provide persistent local file storage.

After deployment, test:

```text
https://your-vercel-backend.vercel.app/api/health
```

## Deploy Frontend on Render

Deploy only the `frontend/` directory as a Render Static Site.

- Root directory: `frontend`
- Build command: leave empty
- Publish directory: `.`

Before deploying the frontend, set the Vercel backend URL in `frontend/config.js`:

```js
window.HOTEL_API_BASE = "https://your-vercel-backend.vercel.app";
```

After Render gives you the live frontend URL, add that exact URL to the backend `ALLOWED_ORIGINS` environment variable in Vercel, then redeploy the backend.
