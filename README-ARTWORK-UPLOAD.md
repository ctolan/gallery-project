# Artwork upload integration draft

## Current behavior

The site is a static Vite bundle served by nginx on Cloud Run. The public gallery remains the three images in `src/App.tsx`. **Prepare photo draft** only keeps selected files and text in page memory so a draft can be previewed locally. It does not call a server, persist data, or publish anything. Closing/reloading the page discards it.

The browser checks JPEG, PNG, and WebP MIME types, at most five files, and 10 MB per file. These checks are for usability only: a browser-provided MIME type is untrusted. No image upload or review is functional until the setup below is completed.

## Recommended integration

Use Firebase Authentication (the `firebase` web SDK) with a private Cloud Run API in the existing Google Cloud project. Verify Firebase ID tokens in the API with `firebase-admin`; store submission metadata in Firestore and sanitized pending images in a private Cloud Storage bucket. Process images server-side with `sharp`. This fits the existing Google Cloud hosting and React static frontend without exposing storage credentials or accepting uploads at the nginx/static site.

The browser upload and review contracts are defined in `src/features/artwork-upload/contracts.ts`. Implement their gateways only after the Firebase project, API origin, and authorization policy are agreed and configured. Do not replace them with unauthenticated direct uploads or client-writable Firestore/Storage rules.

### Request and approval flow

1. Patrick signs in with an enabled Firebase Authentication account. The frontend obtains an ID token from Firebase and sends it as a bearer token to a dedicated Cloud Run API.
2. The API verifies the token and checks an explicit submitter role. It accepts only the fixed image formats, a title up to 120 characters, an optional note up to 500 characters, at most five files, and a maximum of 10 MB per file; it also caps the request body, independently checks file signatures, decodes with pixel/dimension limits, and re-encodes the image (for example, to WebP) with metadata omitted. Never trust client-side validation or filenames.
3. The API generates opaque object names and writes only sanitized output to a private pending prefix. It stores title/note, submitter identity, timestamps, and `pending_review` status in Firestore. Reject unexpected fields and do not store location/EXIF metadata.
4. A parent signs in with a distinct reviewer role. An authenticated review endpoint lists pending submissions and permits an explicit approve/reject transition. Only the server may perform the transition; log actor and time and make it idempotent.
5. On approval, the API publishes the sanitized image to a separate public approved-media location and includes it in the approved gallery catalog. The public catalog must query only approved records. Pending objects and metadata remain private and must never be reachable through a public bucket, static asset path, or public API response.
6. The gallery can fetch the approved catalog from the API when configured. Keep the current checked-in gallery as the fallback and do not merge pending records into it.

Use a narrowly scoped Cloud Run service account (private pending-object access and Firestore access only; publishing permission limited to approved media). Deny browser access to Firestore and Storage. Do not create service-account key files. Configure API CORS for the exact gallery origin, request limits, rate limits, retention/deletion policy, and audit logging. Keep the API public only if required for browser reachability; every submission and review route must still verify identity and role server-side. Only the approved media/catalog read route may be anonymous.

## Setup checklist before enabling submissions

1. Confirm the production GCP project, gallery origin(s), API hostname, and data-retention policy.
2. Enable Firebase Authentication in that project; choose allowed sign-in methods and create Patrick's and the parent's accounts. Define a trusted process for assigning/removing `submitter` and `reviewer` custom claims. Never grant the reviewer role from browser code.
3. Create a private staging bucket and a separate approved-media bucket (or equivalent private-by-default storage layout). Set lifecycle deletion for rejected/abandoned files. Keep public read limited to approved outputs only.
4. Create Firestore collections/rules so clients cannot read/write submissions. Add server-side status validation and an audit record for every approval/rejection.
5. Implement and deploy the Cloud Run API with Firebase ID-token verification, role checks, strict content/signature/dimension/size validation, server-side image re-encoding/metadata stripping, and the pending/review/publish transitions above. Add an authenticated parent review interface; it is not included in this frontend draft.
6. Configure exact-origin CORS, rate limits, monitoring, error handling, backup/deletion policy, and least-privilege runtime IAM. Test attempts to upload anonymously, exceed limits, spoof MIME types, access pending objects, and approve as a submitter; all must fail.
7. Add the Firebase web configuration and API origin as deployment-time Vite settings (for example `VITE_FIREBASE_*` and `VITE_ARTWORK_API_URL`). Firebase web configuration is public client configuration, not a secret; all administrative credentials remain server-side. Rebuild and deploy only after environment-specific values and security rules have been reviewed.
8. Add the real authenticated upload and reviewer flows and verify that a submission is invisible to the public catalog before approval and appears only after approval. Until these checks pass, keep the submit action disabled and the current static gallery unchanged.

No cloud resources, settings, accounts, credentials, or deployment configuration have been created or changed by this draft.
