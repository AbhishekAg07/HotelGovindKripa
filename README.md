# Hotel Govind Kripa Website

Clean full-stack hotel website with a separated frontend and backend.

## Highlights

- Public booking and inquiry forms with server-side validation and rate limiting
- MongoDB persistence with a local JSON development fallback
- Protected admin dashboard for menu, bookings, inquiries, and email diagnostics
- Resend email notifications designed for free Render hosting
- Security headers, CORS allow-listing, request-size limits, and expiring admin sessions
- Automated validation tests and GitHub Actions CI

## Project Structure

```text
frontend/   Public HTML, CSS, browser JavaScript, and images
backend/    Node API server, environment config, storage, and dependencies
```

## Code Guide

- `backend/server.js`: configuration, routes, request handlers, storage, validation, email, and static-file serving in clearly marked sections.
- `frontend/script.js`: public-page behavior, menu loading, booking/inquiry forms, and browser validation.
- `frontend/admin.js`: admin login, dashboard actions, rendering, and API helpers.

To change a feature, start in the matching file and section. API paths are collected near the top of `backend/server.js` in `routeHandlers`.

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

The check command runs JavaScript syntax checks and the backend validation tests.

## API Overview

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/bookings` | Save a booking request |
| `POST` | `/api/inquiries` | Save a customer inquiry |
| `GET` | `/api/menu-items` | Load the public menu |
| `POST` | `/api/admin/login` | Exchange the admin key for an expiring session token |
| `GET` | `/api/bookings` | View bookings as an admin |
| `GET` | `/api/inquiries` | View inquiries as an admin |
| `POST` | `/api/menu-items` | Add a menu item as an admin |

## Configuration

Backend environment files live in `backend/`.

```powershell
Copy-Item backend\.env.example backend\.env
```

Important variables:

- `PORT`: server port, defaults to `8787`
- `ADMIN_KEY`: required for admin dashboard access
- `ADMIN_SESSION_HOURS`: admin session lifetime, defaults to `8`
- `MONGODB_URI`: production database connection string
- `TRUST_PROXY`: set to `true` only when deployed behind a trusted proxy such as Render
- `HOTEL_EMAIL`: recipient for booking and inquiry notifications
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: free email delivery on Render

Without `MONGODB_URI`, local development uses JSON files in `backend/data/`. Do not use JSON fallback for production traffic.

## Automatic Email

For Render Free services, configure Resend because Render blocks SMTP. In the Render backend service, set `RESEND_API_KEY` and `HOTEL_EMAIL` to the same email address used to register the Resend account. Keep `RESEND_FROM_EMAIL` as `Hotel Govind Kripa <onboarding@resend.dev>`.

Bookings and inquiries are saved before the hotel notification email is sent, so customers see an immediate confirmation on the website. The free Resend sender is for owner notifications only; customer email confirmations require a domain you own.

## Deploy Frontend on Vercel

Deploy only the `frontend/` directory to Vercel.

- Root directory: `frontend`
- Framework preset: Other
- Build command: leave empty
- Output directory: `.`
- Install command: leave empty

The included `vercel.json` adds browser security headers to the static deployment.

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

Use MongoDB Atlas or another MongoDB database in production. Render can restart services, so MongoDB is safer than relying on local JSON files for production traffic.

For email on Render free services, use `RESEND_API_KEY`. SMTP is not used by this project.

After deployment, test:

```text
https://your-render-backend.onrender.com/api/health
```

After Vercel gives you the live frontend URL, add that exact URL to the backend `ALLOWED_ORIGINS` environment variable in Render, then redeploy the backend.

## Architecture

```text
Vercel static frontend
        |
        v
Render Node.js API ---- MongoDB Atlas
        |
        v
Resend email API
```

## Quality Checks

GitHub Actions runs `npm run check` and a production dependency audit on every push and pull request. The validation tests live in `backend/test/` and use Node's built-in test runner, so no paid tooling is required.
