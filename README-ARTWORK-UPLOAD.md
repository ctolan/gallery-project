# Artwork upload and review workflow

## Implemented in this branch

- The existing public gallery remains available at `/`, with a link to `/submit`. The nginx SPA fallback already serves direct navigation to `/submit` and `/review`.
- `/submit` is a mobile page with **Take a photo** and **Choose from library** controls, title/note fields, previews, and progress/errors. The browser accepts at most five JPEG/PNG/WebP camera originals up to 25 MB each.
- Before upload, the browser decodes and re-encodes each image, applying orientation and stripping EXIF/GPS metadata, downscaling to at most 2560 px on the longest side. It retries JPEG compression and, if needed, reduces dimensions further until the optimized file is at most 4 MB. Only optimized blobs and object-URL previews are retained; original file bytes and filenames are not sent or stored.
- The browser gateway sends the optimized blobs using Firebase ID-token bearer auth. The submit button is enabled only when both `VITE_ARTWORK_API_URL` is configured and `VITE_ARTWORK_UPLOAD_ENABLED=true`.
- `/review` provides an authenticated pending-image review UI. It fetches private previews through the API, then offers approve/publish or reject; a partially completed publishing decision can be retried.
- `api/` contains the separate Node 22 Cloud Run API. It verifies Firebase ID tokens, checks a server-side email allowlist for submitter/reviewer roles, independently decodes and re-encodes images with Sharp, and stores only sanitized output. Its pending/review routes are authenticated; the public catalog returns approved records only. Public image URLs use an API proxy that checks the Firestore approval state and object path before reading from the private approved bucket.
- Approval is an explicit server-side transition, audited in Firestore. Rejection moves media to a private rejected prefix and resets its 14-day storage/metadata expiry. Pending uploads expire 14 days after creation. Approved media has no expiry.
- Firestore rules deny all direct client access. `infra/pending-lifecycle.json` configures the 14-day storage lifecycle for both `pending/` and `rejected/` prefixes.
- Automated tests cover unauthenticated submission rejection, server-side byte limits and MIME/content spoofing, non-reviewer approval rejection, pending-media privacy, idempotent review transitions, rejected expiry metadata, approval-only public catalog visibility, image resize/re-encoding, and metadata removal.

**Frontend deployed; submissions enabled for live testing:** The frontend is live on `https://patrick.tolan.ie` with Firebase and API configuration. Revision `gallery-app-00014-tar` sets `VITE_ARTWORK_UPLOAD_ENABLED=true` and uses `patrick.tolan.ie` as Firebase `authDomain`; Nginx proxies Firebase's `/__/auth/*` helper requests to the project Firebase domain so the Auth helper iframe uses the same browser origin. Google sign-in now uses `signInWithPopup` instead of a full-page redirect (see "Temporary account and authenticated test status" below for why), which avoids the mobile storage-bounce failure previously seen on `/review`. This has not yet been retested live on a mobile browser since the popup change. No submission has reached Firestore/storage yet. Client limits are only usability checks; a malicious client can bypass them. The API independently enforces actual type, file size, pixel count, dimensions/output encoding, role, and request constraints.

## Provisioning state — API and frontend deployed; submissions remain gated

On 2026-09-30, `ctolan@gmail.com` verified project `gallery-app-457314` (`Gallery-app`, ACTIVE; project number `151307084226`) and Owner access. Firebase project registration and the isolated storage/database resources are complete. Google sign-in is enabled and verified through Identity Toolkit. The API and private approved-image proxy are deployed. The frontend is deployed to the existing Cloud Run production service at `https://patrick.tolan.ie`; photo submission remains disabled pending authenticated end-to-end verification.

| Resource | Current state |
|---|---|
| Firebase project | `gallery-app-457314`, registered; Firebase also reports Hosting site `gallery-app-457314` |
| Firebase web app | `1:151307084226:web:d22cad73f020f0b176b65b`, “Gallery artwork upload and review” |
| Firebase Authentication | Initialized; `patrick.tolan.ie` authorized; Google provider enabled (verified through Identity Toolkit); configured for temporary `ctolan@gmail.com` testing |
| Firestore `(default)` | Pre-existing `nam5`, US, **Datastore mode**; untouched |
| Firestore artwork database | `projects/gallery-app-457314/databases/artwork`, Native/Standard, `europe-west1`, deletion protection enabled |
| Firestore rules | Deny-all release deployed to `cloud.firestore/artwork`; anonymous REST read was verified to return 403 |
| Firestore expiry | TTL on `submissions.expiresAt` is ACTIVE |
| Private pending/rejected bucket | `gs://gallery-app-457314-artwork-pending`, `europe-west1`, uniform access, public-access prevention enforced, no soft-delete retention, 14-day lifecycle on `pending/` and `rejected/` |
| Approved-media bucket | `gs://gallery-app-457314-artwork-approved`, `europe-west1`, uniform access; private, no public grant; approved images are read through the API proxy |
| Runtime service account | `artwork-api-runtime@gallery-app-457314.iam.gserviceaccount.com`, no key created |
| Cloud Run API | `artwork-api`, `europe-west1`; URL `https://artwork-api-4bigtfzbma-ew.a.run.app`; service min instances 0, max 2, 1 CPU, 1 GiB, concurrency 1, 120s timeout; revision `artwork-api-00002-4sz` |
| Gallery frontend | Cloud Run service `gallery-app`, `us-central1`; production URL `https://patrick.tolan.ie`; revision `gallery-app-00014-tar` (100% traffic); image `gcr.io/gallery-app-457314/gallery-app:artwork-ui-csp2-20260930-1554`; custom Firebase auth domain and same-origin helper proxy configured; `VITE_ARTWORK_UPLOAD_ENABLED=true` |

Firebase, Identity Toolkit, Firestore, and Firebase Rules APIs are enabled. Cloud Run, Cloud Build, and Artifact Registry APIs were already enabled. Firebase project registration added Firebase-managed service-agent bindings; provisioning did not change unrelated buckets or Firestore databases. The gallery frontend was subsequently updated only in the explicitly authorized deployment described above.

The existing default database is incompatible with the Firestore SDK workflow and must not be converted, replaced, or used for the artwork API. A separate named Native database keeps the existing US Datastore-mode database untouched. The additional Native database reports `freeTier: false`; expect usage-based Firestore charges rather than assuming the free-tier allowance. Cloud Run will use `min=0`, but that does not eliminate database, storage, build, or network costs.

The runtime service account has bucket-scoped `objectAdmin` on the private bucket and `objectCreator`/`objectViewer` on the approved bucket. Project custom roles limit Firestore document operations and Firebase Auth user lookup; the Firestore role is bound with an IAM condition matching only `projects/gallery-app-457314/databases/artwork`. The deployed API's `/api/gallery` endpoint successfully queried the artwork database using this identity. Both buckets were checked after deployment and have no `allUsers` grant. Public gallery image requests go through the API, which checks that the corresponding Firestore submission is approved and the object path belongs to that submission before reading the private object. This avoids bucket-wide public reads; the API incurs a Firestore lookup and Cloud Run/storage egress per uncached image request. Successful image responses are cacheable for up to one hour.

Cloud Run is publicly invokable so the phone browser can reach it, but application routes enforce identity: live unauthenticated submission returned 401 and an unknown approved-image proxy path returned 404. The live health endpoint returned 200 and the approved catalog was empty before live testing began. The API maximum instance count was verified at the service level as 2; minimum is 0. Google sign-in was confirmed by the user on the live page. Authenticated upload, review, and publication results are pending the user's current test.

## Temporary account and authenticated test status

For initial testing only, the user explicitly authorized `ctolan@gmail.com` as both `SUBMITTER_EMAIL` and `REVIEWER_EMAIL`; the deployed API currently uses this configuration. This is temporary and allows the same account to approve its own submissions, so it does **not** provide independent parent review. Before actual family use, change the submitter to Patrick's Google account and the reviewer to the parent's account. The API enforces exact server-side email allowlists, never client-provided roles.

Google Sign-In provider state was verified enabled through Identity Toolkit, and `patrick.tolan.ie` is present in Firebase Authentication Authorized domains. The previous production build used `gallery-app-457314.firebaseapp.com` as `authDomain`, so mobile browsers treated the helper iframe as third-party storage and sign-in did not persist reliably. The current build uses `patrick.tolan.ie` and transparently proxies GET/POST requests under `/__/auth/` to Firebase; production logs show successful helper requests, and the callback URL/query reaches Firebase (a harmless probe produces identical handler content through the proxy and Firebase origin).

The remaining callback error is explained by the Google OAuth Web client configuration: the client currently has only the Firebase-generated origin/callback. A non-authenticating probe to Google's OAuth endpoint accepts `https://gallery-app-457314.firebaseapp.com/__/auth/handler` but rejects `https://patrick.tolan.ie/__/auth/handler` (redirects to Google's OAuth error endpoint). Firebase's redirect best-practices require adding the custom callback URI to the OAuth provider's authorized redirect URIs. The app's `authDomain`/proxy configuration alone is insufficient.

The user added, in Google Cloud Console → APIs & Services → Credentials, to the Firebase Google provider's Web OAuth client (client ID `151307084226-rq2ekpv7hik20jfcu85aa9v234gvic97.apps.googleusercontent.com`):

- Authorized JavaScript origin: `https://patrick.tolan.ie`
- Authorized redirect URI: `https://patrick.tolan.ie/__/auth/handler`

(alongside the existing `https://gallery-app-457314.firebaseapp.com` origin/callback). The static config was correct: this was re-verified independently, both `https://patrick.tolan.ie/__/auth/handler` and the original `firebaseapp.com` callback are accepted by Google's OAuth endpoint (no `redirect_uri_mismatch`), Firebase Authorized domains include `patrick.tolan.ie`, and the Google provider is enabled.

Despite the correct static config, live testing still hit "The requested action is invalid" after completing Google sign-in. This is a known Firebase Auth failure mode for `signInWithRedirect` with a custom `authDomain`: the SDK does a same-origin "storage bounce" through the `authDomain` to persist pending-redirect state (in IndexedDB/local/session storage) before navigating to Google, then must read that state back on return. Some mobile browsers (iOS Safari ITP, Chrome storage partitioning) can fail that bounce even when the domain and proxy are otherwise correct, producing this exact error.

**Fix:** switched Google sign-in from `signInWithRedirect`/`getRedirectResult` to `signInWithPopup` (`src/features/auth/AuthContext.tsx`). A popup keeps the whole sign-in on a single page load — no full-page navigation away and back, so there is no storage-bounce step to fail. `signIn()` is still only invoked directly from the button's `onClick` handler, preserving the user-gesture requirement mobile browsers need to allow a popup. The Nginx `/__/auth/*` proxy and the OAuth client's custom-domain redirect URI are left in place; they remain harmless and are still needed by the Firebase Auth iframe helper that the popup flow also relies on.

## Remaining steps

1. Retry Google sign-in (now a popup) on `/submit` and `/review` on the mobile browser to confirm sign-in completes and persists, then verify the first authenticated upload, reviewer decision, and approved-photo visibility through the API proxy.
2. Replace the temporary same-account allowlist with Patrick's and the parent's separate Google accounts before relying on the independent approval boundary. For the explicitly authorized initial live test, `ctolan@gmail.com` is configured as both submitter and reviewer, which permits self-approval.

Both buckets remain private. No public bucket grant is needed for gallery display: the API proxy serves approved images only. Do not add a public object grant. `cloudbuild.gallery.yaml` defaults to `patrick.tolan.ie` as the Firebase auth domain and `VITE_ARTWORK_UPLOAD_ENABLED=false`; override the latter to `true` only for an explicitly authorized live test.

Cloud Run was built by Cloud Build from the API Dockerfile. The deployed service has min instances 0 and max instances 2, but this does not remove charges for builds, Firestore, storage, image requests, or egress. Project billing is linked; actual spend was not queried. The new Native Firestore database reports `freeTier: false`, so usage-based Firestore charges should be expected.
