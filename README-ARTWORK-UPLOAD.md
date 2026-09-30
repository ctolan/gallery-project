# Artwork upload and review workflow

## Implemented in this branch

- The existing public gallery remains available at `/`, with a link to `/submit`. The nginx SPA fallback already serves direct navigation to `/submit` and `/review`.
- `/submit` is a mobile page with **Take a photo** and **Choose from library** controls, title/note fields, previews, and progress/errors. The browser accepts at most five JPEG/PNG/WebP camera originals up to 25 MB each.
- Before upload, the browser decodes and re-encodes each image, applying orientation and stripping EXIF/GPS metadata, downscaling to at most 2560 px on the longest side. It retries JPEG compression and, if needed, reduces dimensions further until the optimized file is at most 4 MB. Only optimized blobs and object-URL previews are retained; original file bytes and filenames are not sent or stored.
- The browser gateway sends the optimized blobs using Firebase ID-token bearer auth. The submit button is enabled only when both `VITE_ARTWORK_API_URL` is configured and `VITE_ARTWORK_UPLOAD_ENABLED=true`.
- `/review` provides an authenticated pending-image review UI. It fetches private previews through the API, then offers approve/publish or reject; a partially completed publishing decision can be retried.
- `api/` contains the separate Node 22 Cloud Run API. It verifies Firebase ID tokens, checks a server-side email allowlist for submitter/reviewer roles, independently decodes and re-encodes images with Sharp, and stores only sanitized output. Its pending/review routes are authenticated; the public catalog returns approved records only.
- Approval is an explicit server-side transition, audited in Firestore. Rejection moves media to a private rejected prefix and resets its 14-day storage/metadata expiry. Pending uploads expire 14 days after creation. Approved media has no expiry.
- Firestore rules deny all direct client access. `infra/pending-lifecycle.json` configures the 14-day storage lifecycle for both `pending/` and `rejected/` prefixes.
- Automated tests cover unauthenticated submission rejection, server-side byte limits and MIME/content spoofing, non-reviewer approval rejection, pending-media privacy, idempotent review transitions, rejected expiry metadata, approval-only public catalog visibility, image resize/re-encoding, and metadata removal.

**Not enabled in this branch:** there is no cloud API URL/Firebase client configuration committed, and the default upload flag is `false`. Client limits are only usability checks; a malicious client can bypass them. The API independently enforces actual type, file size, pixel count, dimensions/output encoding, role, and request constraints. Cloud Storage access policies and Firestore rules must be deployed before turning uploads on.

## Provisioning state — partially provisioned; not deployed

On 2026-09-30, `ctolan@gmail.com` verified project `gallery-app-457314` (`Gallery-app`, ACTIVE; project number `151307084226`) and Owner access. Firebase project registration and the foundational isolated storage/database resources are complete. **No Cloud Run service or frontend deployment exists yet. Google sign-in is not configured, and uploads remain disabled.**

| Resource | Current state |
|---|---|
| Firebase project | `gallery-app-457314`, registered; Firebase also reports Hosting site `gallery-app-457314` |
| Firebase web app | `1:151307084226:web:d22cad73f020f0b176b65b`, “Gallery artwork upload and review” |
| Firebase Authentication | Google provider not enabled; Identity Toolkit reports no Auth configuration yet |
| Firestore `(default)` | Pre-existing `nam5`, US, **Datastore mode**; untouched |
| Firestore artwork database | `projects/gallery-app-457314/databases/artwork`, Native/Standard, `europe-west1`, deletion protection enabled |
| Firestore rules | Deny-all release deployed to `cloud.firestore/artwork`; anonymous REST read was verified to return 403 |
| Firestore expiry | TTL on `submissions.expiresAt` is ACTIVE |
| Private pending/rejected bucket | `gs://gallery-app-457314-artwork-pending`, `europe-west1`, uniform access, public-access prevention enforced, no soft-delete retention, 14-day lifecycle on `pending/` and `rejected/` |
| Approved-media bucket | `gs://gallery-app-457314-artwork-approved`, `europe-west1`, uniform access; no public grant yet |
| Runtime service account | `artwork-api-runtime@gallery-app-457314.iam.gserviceaccount.com`, no key created |
| Cloud Run API | Not deployed; URL not assigned |
| Gallery frontend | Not deployed; `VITE_ARTWORK_UPLOAD_ENABLED=false` |

Firebase, Identity Toolkit, Firestore, and Firebase Rules APIs are enabled. Cloud Run, Cloud Build, and Artifact Registry APIs were already enabled. Firebase project registration added Firebase-managed service-agent bindings; no unrelated existing bucket, Firestore database, or live gallery configuration was changed.

The existing default database is incompatible with the Firestore SDK workflow and must not be converted, replaced, or used for the artwork API. A separate named Native database keeps the existing US Datastore-mode database untouched. The additional Native database reports `freeTier: false`; expect usage-based Firestore charges rather than assuming the free-tier allowance. Cloud Run will use `min=0`, but that does not eliminate database, storage, build, or network costs.

The runtime service account has bucket-scoped `objectAdmin` on the private bucket and `objectCreator`/`objectViewer` on the approved bucket. Project custom roles limit Firestore document operations and Firebase Auth user lookup; the Firestore role is bound with an IAM condition matching only `projects/gallery-app-457314/databases/artwork`. No public grant exists on either bucket yet. The database access condition still needs to be verified from the deployed runtime before enabling submissions.

## Required human setup

1. Firebase is registered and the web app exists. In Firebase Console, enable **Google** under Authentication → Sign-in method, choose the user-facing support email, and add `patrick.tolan.ie` to authorized domains. The web app config is public client config; never put service-account credentials in Vite variables.
2. Provide the exact Google email address for Patrick's submitter account and the parent's reviewer account. The API uses exact server-side email allowlists (`SUBMITTER_EMAIL`, `REVIEWER_EMAIL`); client input/custom claims cannot grant roles. The two addresses must be distinct and Google-verified.
3. If the project requires OAuth consent or support-contact setup in a browser, complete that in the Cloud Console. No address or consent details have been guessed.

## Provision and deploy

The project/account have been verified and APIs/database/rules/buckets/identity are provisioned as recorded above. Do not repeat create steps. Remaining deployment must wait for the Google-provider, support-email, and two role-email values above.

1. The required Cloud Run/Build/Artifact Registry APIs were already enabled in the verified project; no additional service APIs are needed at this stage.

2. Enable public object viewing only for the approved-media bucket when ready to deploy: grant `allUsers:roles/storage.objectViewer` to `gallery-app-457314-artwork-approved`. Never grant public access to the pending bucket. Abort if policy rejects public reads; do not weaken an organization policy.
3. Confirm the IAM condition on the custom Firestore role works against the deployed API. If it blocks `artwork` requests, diagnose and correct the condition; do not replace it with a broad project-wide `roles/datastore.user` grant.
4. Deploy the API with the dedicated runtime identity, `ARTWORK_DATABASE_ID=artwork`, exact bucket names and gallery origin, the two confirmed email allowlists, Node 22, `min=0`, `max=2`, one CPU, 1 GiB memory, concurrency 1, and an appropriate request timeout. Make Cloud Run invokable by browsers; application routes still enforce Firebase ID tokens and server-side roles. The only anonymous API route is `/api/gallery`.
5. Configure the frontend with the Firebase web app's public config and deployed API URL. Keep `VITE_ARTWORK_UPLOAD_ENABLED=false`.
6. Run real-account end-to-end checks before enabling uploads: unauthenticated submission returns 401; another account and the submitter cannot review/approve; spoofed and oversized files are rejected; pending objects are not publicly reachable; approval makes sanitized media visible in the approved catalog; rejection remains private; and the configured 14-day retention controls are active. Then deploy the static gallery update without removing/changing existing gallery content and enable uploads only after those checks pass.

Cloud Run's planned minimum instance count is zero. The local test suites pass, but Docker access is unavailable in this workspace and the API has not been cloud-built or deployed. Firebase Auth provider setup, approved-bucket public grant, API deployment, real Firebase-account tests, and frontend deployment remain outstanding. No live site settings have been changed.
