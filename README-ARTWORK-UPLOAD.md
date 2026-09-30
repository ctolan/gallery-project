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

**Not enabled in the frontend:** `VITE_ARTWORK_UPLOAD_ENABLED` remains `false`, and no frontend deployment has been made. The Cloud Run API is live at the URL below. Client limits are only usability checks; a malicious client can bypass them. The API independently enforces actual type, file size, pixel count, dimensions/output encoding, role, and request constraints.

## Provisioning state — API deployed; frontend and authenticated E2E remain gated

On 2026-09-30, `ctolan@gmail.com` verified project `gallery-app-457314` (`Gallery-app`, ACTIVE; project number `151307084226`) and Owner access. Firebase project registration and the isolated storage/database resources are complete. Google sign-in is enabled and verified through Identity Toolkit. The API and private approved-image proxy are deployed. The frontend remains disabled and the live gallery has not been changed.

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
| Gallery frontend | Not deployed; `VITE_ARTWORK_UPLOAD_ENABLED=false` |

Firebase, Identity Toolkit, Firestore, and Firebase Rules APIs are enabled. Cloud Run, Cloud Build, and Artifact Registry APIs were already enabled. Firebase project registration added Firebase-managed service-agent bindings; no unrelated existing bucket, Firestore database, or live gallery configuration was changed.

The existing default database is incompatible with the Firestore SDK workflow and must not be converted, replaced, or used for the artwork API. A separate named Native database keeps the existing US Datastore-mode database untouched. The additional Native database reports `freeTier: false`; expect usage-based Firestore charges rather than assuming the free-tier allowance. Cloud Run will use `min=0`, but that does not eliminate database, storage, build, or network costs.

The runtime service account has bucket-scoped `objectAdmin` on the private bucket and `objectCreator`/`objectViewer` on the approved bucket. Project custom roles limit Firestore document operations and Firebase Auth user lookup; the Firestore role is bound with an IAM condition matching only `projects/gallery-app-457314/databases/artwork`. The deployed API's `/api/gallery` endpoint successfully queried the artwork database using this identity. Both buckets were checked after deployment and have no `allUsers` grant. Public gallery image requests go through the API, which checks that the corresponding Firestore submission is approved and the object path belongs to that submission before reading the private object. This avoids bucket-wide public reads; the API incurs a Firestore lookup and Cloud Run/storage egress per uncached image request. Successful image responses are cacheable for up to one hour.

Cloud Run is publicly invokable so the phone browser can reach it, but application routes enforce identity: live unauthenticated submission returned 401 and an unknown approved-image proxy path returned 404. The live health endpoint returned 200 and the approved catalog returned an empty list. The API maximum instance count was verified at the service level as 2; minimum is 0. Google sign-in is enabled, but authenticated end-to-end submission and approval have not yet been exercised: the available `gcloud` OAuth access token is not a Firebase ID token, and attempting to exchange it did not yield one. No IAM permissions were broadened for that attempt. The current live catalog is empty.

## Temporary account and authenticated test status

For initial testing only, the user explicitly authorized `ctolan@gmail.com` as both `SUBMITTER_EMAIL` and `REVIEWER_EMAIL`; the deployed API currently uses this configuration. This is temporary and allows the same account to approve its own submissions, so it does **not** provide independent parent review. Before actual family use, change the submitter to Patrick's Google account and the reviewer to the parent's account. The API enforces exact server-side email allowlists, never client-provided roles.

Google Sign-In provider state was verified enabled through Identity Toolkit. The support-email value could not be independently confirmed; verify it is `ctolan@gmail.com` in Firebase Authentication settings if that address should be used. Authenticated live tests still require an actual Firebase ID token obtained by signing in to the Firebase web app. Do not enable the public site's upload control or deploy the frontend without separate approval. To complete E2E testing later, obtain a Firebase ID token through a browser sign-in flow for the configured web app, then use it only in a secure local test (do not put it in source, PR text, or logs). Tests must cover authenticated submission, private pending media, approval-only proxy visibility, rejection privacy, role checks, and validation. The available `gcloud` OAuth token cannot substitute for this Firebase token.

## Remaining steps — gated by explicit authorization

1. Obtain a real Firebase ID token through a browser sign-in flow and run authenticated live tests against the API. The API is deployed and Google sign-in is verified, but this end-to-end test is not complete.
2. Replace the temporary same-account allowlist with Patrick's and the parent's separate Google accounts before relying on the independent approval boundary.
3. Only after explicit authorization, build/deploy the public frontend; leave `VITE_ARTWORK_UPLOAD_ENABLED=false` unless separately authorized to enable submissions. The current frontend deployment is intentionally withheld.

Both buckets must remain private. No public bucket grant is needed for gallery display: the API proxy serves approved images only. Do not add a public object grant or change live frontend settings.

Cloud Run was built by Cloud Build from the API Dockerfile. The deployed service has min instances 0 and max instances 2, but this does not remove charges for builds, Firestore, storage, image requests, or egress. Project billing is linked; actual spend was not queried. The new Native Firestore database reports `freeTier: false`, so usage-based Firestore charges should be expected.
