# Hash Self Onboarding

Pre-login self-onboarding flow for new gaming cafes.

## Flow

1. Owner enters email and gets OTP.
2. Owner verifies OTP (email validation first).
3. Cafe identity can be fetched from Google search (name/address + lat/lng).
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
- `GOOGLE_MAPS_API_KEY` (required for cafe search and place autofill)

## Frontend API Routes (in this project)

- `POST /api/self-onboard/send-otp`
- `POST /api/self-onboard/verify-otp`
- `GET /api/google/cafe-search?q=...`
- `GET /api/google/cafe-details?placeId=...`
- `POST /api/self-onboard` (multipart form: payload + document files)

## Backend Dependencies

`hfg-onboard` must expose:

- `POST /api/self-onboard/send-email-otp`
- `POST /api/self-onboard/verify-email-otp`
- `POST /api/onboard`

Mail dispatch remains backend-managed (`hfg-onboard` Flask-Mail config).
