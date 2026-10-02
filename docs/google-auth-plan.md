# Google Authentication — Implementation Plan

Branch: `google-auth` · Base: `main` (`943574c`)

## Goal

Let users sign in with their Google account (no email/password), alongside the existing email+password flow. Existing accounts keep working; a user who signs up by email can later sign in with Google using the same email.

## Approach: Google Identity Services (GIS) ID-token flow

The standard SPA pattern — no redirect dance, no server-side OAuth round trip:

```
Browser                          Express API
  │  GIS loads (gsi/client)         │
  │  User clicks "Continue with     │
  │  Google" / One Tap              │
  │  Google returns ID token (JWT)  │
  │ ──────────────────────────────> │
  │ POST /api/auth/google           │
  │   { credential: <id_token> }    │
  │                                 │  verifyIdToken({ idToken, audience })
  │                                 │  → { sub, email, name, picture }
  │                                 │  find user by email → create if missing
  │                                 │  issue own JWT (same as password login)
  │ <────────── { token, user } ──  │
```

Key facts that keep this small:

- **Verification needs only `GOOGLE_CLIENT_ID`** (a public value). ID tokens are verified against Google's public keys with `google-auth-library`'s `OAuth2Client.verifyIdToken`. No client secret, no redirect URIs, no token exchange — which also means it works cleanly on Vercel serverless (no callback route needed).
- **The client ID is not a secret** — safe to embed in the Vite bundle and share with the frontend.

## Server changes (`server/`)

1. **Dependency**: add `google-auth-library` (deps: express, jsonwebtoken, bcryptjs, mongodb stay).
2. **Env** (local `.env` + Vercel): `GOOGLE_CLIENT_ID=<from Google Cloud Console>`.
3. **New route** `POST /api/auth/google` (no `auth` middleware):
   - Body: `{ credential: string }` (the Google ID token).
   - `OAuth2Client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })` in try/catch → 401 `{ error: 'Invalid Google token' }` on failure (this is the trust boundary — never trust the raw token).
   - Extract `payload.email` (require `email_verified === true` for new signups; existing-user login tolerant).
   - Find user by email:
     - **Exists** → log in (Google is an alternative sign-in for the same account; password hash untouched).
     - **Missing** → create `{ name: payload.name, email, passwordHash: null, timezone: 'Asia/Kolkata', createdAt }`.
   - Respond `{ token: sign(user.id, tz), user: { id, name, email } }` — identical shape to `/api/auth/login`, so the client `adopt()` flow works unchanged.
4. **Password-login guard**: if `row.passwordHash` is null (Google-only account), `POST /api/auth/login` must return `401 { error: 'This account uses Google sign-in' }` instead of crashing on `bcrypt.compareSync(password, null)`.

## Client changes (`client/`)

1. **Load GIS**: `<script src="https://accounts.google.com/gsi/client" async defer>` in `index.html` (or dynamic loader).
2. **Login page** (`src/pages/Login.jsx`): add a **CONTINUE WITH GOOGLE** button below the LOG IN / CREATE ACCOUNT toggle:
   - On mount: `google.accounts.id.initialize({ client_id, callback: onCredential })` once (guard against double-init).
   - Button click → `google.accounts.id.prompt()` (One Tap) — or render Google's button for maximum sign-in coverage.
   - `onCredential(response)` → `api('/api/auth/google', { method: 'POST', body: { credential: response.credential } })` → `adopt(d)` (the existing store.jsx login flow) → Gate flips to Shell.
   - Keyboard-accessible fallback: a plain-styled button (GIS renders its own iframe button; we can also keep a `google.accounts.id.renderButton` for the official look).
3. **No changes** to `store.jsx`/`api.js`/routing — the endpoint returns the same `{ token, user }` contract.

## Security notes

- **Never trust the client token** — always `verifyIdToken` server-side with the `audience` check; verify the token signature, expiry, issuer (`accounts.google.com`).
- Require `email_verified` before auto-creating an account from Google.
- `GOOGLE_CLIENT_ID` is public; do **not** commit `GOOGLE_CLIENT_SECRET` (we don't need one for this flow).
- Keep the existing password flow intact — Google is additive, not a replacement.

## Google Cloud Console setup (manual, user-side — ~5 min)

1. https://console.cloud.google.com → create/select project → **APIs & Services → OAuth consent screen** → set app name, user type External.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
3. Copy the **Client ID** → put in `server/.env` (`GOOGLE_CLIENT_ID=...`) and Vercel (Settings → Environment Variables → Production).
4. **Authorized JavaScript origins**: add `http://localhost:5173` (dev) and `https://habit-tracker-eosin-nine.vercel.app` (prod) — required for GIS to work from the browser.
5. Publish the consent screen (External testing allows only listed test users; for public use set "In production").

## Deployment

1. Set `GOOGLE_CLIENT_ID` in Vercel Production env.
2. Push branch → merge to `main` → deploy (or `vercel --prod` from this branch).
3. Add any extra preview-URL origins to the console as needed.

## Testing plan

- **Unit**: `POST /api/auth/google` with a garbage credential → 401; with a valid-shaped but forged token → 401 (signature fails).
- **Local end-to-end**: run dev servers, click Google button with a test Google account → lands in dashboard with JWT in localStorage.
- **Migration check**: existing email+password accounts still log in; a Google login with the same email links to the same account (no duplicate users).
- **Password-only account**: existing users unaffected.
- **Google-only account**: attempting password login → clean 401 message.

## Out of scope (this branch)

- Google sign-out revocation (`google.accounts.id.disableAutoSelect` / session revocation) — add later if wanted.
- OAuth2 code-flow with `GOOGLE_CLIENT_SECRET` (only needed if we later want server-side refresh tokens / calendar integration).
- Apple / GitHub / other providers — same pattern, swap the verifier.