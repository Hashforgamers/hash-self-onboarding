# Hash Self Onboarding

Pre-login self-onboarding flow for new gaming cafes.

## Flow

1. Owner enters email and gets OTP.
2. Owner verifies OTP (email validation first).
3. Cafe identity is entered manually, with map click/drag to set lat/lng.
4. Inventory setup includes PC/Xbox/PS5/VR + operating hours.
5. Amenities are selected and all required documents are uploaded.
6. Submit to onboard backend (`/api/onboard`).

On success, UI shows confirmation: check email for onboarding confirmation and upcoming credentials/dashboard link.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env.local` and set:

- `SELF_ONBOARD_BACKEND_URL` (e.g. `https://hfg-onboard.onrender.com`)
- `SELF_ONBOARD_SERVICE_KEY` (optional)
- `USER_ONBOARD_BACKEND_URL` (e.g. `https://hfg-user-onboard.onrender.com`)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (required for right-side map picker)
- `GOOGLE_MAPS_API_KEY` (optional, only for `/api/google/*` fallback routes)

## Frontend API Routes (in this project)

- `POST /api/self-onboard/send-otp`
- `POST /api/self-onboard/verify-otp`
- `GET /api/google/cafe-search?q=...`
- `GET /api/google/cafe-details?placeId=...`
- `POST /api/self-onboard` (multipart form: payload + document files)
- `POST /api/users/hash-coins` (body: `{ "amount": 500 }`, auth via `Authorization: Bearer <token>` or `token` in body)

## Backend Dependencies

`hfg-onboard` must expose:

- `POST /api/self-onboard/send-email-otp`
- `POST /api/self-onboard/verify-email-otp`
- `POST /api/onboard`

`hfg-user-onboard` must expose:

- `POST /api/users/hash-coins`

Mail dispatch remains backend-managed (`hfg-onboard` Flask-Mail config).
