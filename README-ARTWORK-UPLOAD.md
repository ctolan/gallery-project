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

**Not enabled in the frontend:** `VITE_ARTWORK_UPLOAD_ENABLED` remains `false`, and no frontend deployment has been made. The Cloud Run API is live at the URL below. Client limits are only usability checks; a malicious client can bypass them. The API independently enforces actual type, file size, pixel count, dimensions/output encoding, role, and request constraints.

## Provisioning state — API deployed; sign-in and publishing remain gated

On 2026-09-30, `ctolan@gmail.com` verified project `gallery-app-457314` (`Gallery-app`, ACTIVE; project number `151307084226`) and Owner access. Firebase project registration and the foundational isolated storage/database resources are complete. The Cloud Run API is deployed, but Google sign-in is not yet enabled, approved media remains private, and uploads remain disabled.

| Resource | Current state |
|---|---|
| Firebase project | `gallery-app-457314`, registered; Firebase also reports Hosting site `gallery-app-457314` |
| Firebase web app | `1:151307084226:web:d22cad73f020f0b176b65b`, “Gallery artwork upload and review” |
| Firebase Authentication | Initialized; `patrick.tolan.ie` authorized; Google provider not enabled |
| Firestore `(default)` | Pre-existing `nam5`, US, **Datastore mode**; untouched |
| Firestore artwork database | `projects/gallery-app-457314/databases/artwork`, Native/Standard, `europe-west1`, deletion protection enabled |
| Firestore rules | Deny-all release deployed to `cloud.firestore/artwork`; anonymous REST read was verified to return 403 |
| Firestore expiry | TTL on `submissions.expiresAt` is ACTIVE |
| Private pending/rejected bucket | `gs://gallery-app-457314-artwork-pending`, `europe-west1`, uniform access, public-access prevention enforced, no soft-delete retention, 14-day lifecycle on `pending/` and `rejected/` |
| Approved-media bucket | `gs://gallery-app-457314-artwork-approved`, `europe-west1`, uniform access; no public grant yet |
| Runtime service account | `artwork-api-runtime@gallery-app-457314.iam.gserviceaccount.com`, no key created |
| Cloud Run API | `artwork-api`, `europe-west1`; URL `https://artwork-api-4bigtfzbma-ew.a.run.app`; min instances 0 (default), max 2, 1 CPU, 1 GiB, concurrency 1 |
| Gallery frontend | Not deployed; `VITE_ARTWORK_UPLOAD_ENABLED=false` |

Firebase, Identity Toolkit, Firestore, and Firebase Rules APIs are enabled. Cloud Run, Cloud Build, and Artifact Registry APIs were already enabled. Firebase project registration added Firebase-managed service-agent bindings; no unrelated existing bucket, Firestore database, or live gallery configuration was changed.

The existing default database is incompatible with the Firestore SDK workflow and must not be converted, replaced, or used for the artwork API. A separate named Native database keeps the existing US Datastore-mode database untouched. The additional Native database reports `freeTier: false`; expect usage-based Firestore charges rather than assuming the free-tier allowance. Cloud Run will use `min=0`, but that does not eliminate database, storage, build, or network costs.

The runtime service account has bucket-scoped `objectAdmin` on the private bucket and `objectCreator`/`objectViewer` on the approved bucket. Project custom roles limit Firestore document operations and Firebase Auth user lookup; the Firestore role is bound with an IAM condition matching only `projects/gallery-app-457314/databases/artwork`. The deployed API's `/api/gallery` endpoint successfully queried the artwork database using this identity. Neither bucket has an `allUsers` grant.

Cloud Run is publicly invokable so the phone browser can reach it, but application routes enforce identity: live unauthenticated submission returned 401, `/api/review/submissions` returned 401, and an unapproved Origin returned 403. The live health endpoint returned 200 and the approved catalog returned an empty list. The API is not a functioning upload service until Google sign-in is enabled.

## One remaining Firebase Console action

Open [Firebase Authentication → Sign-in method for this project](https://console.firebase.google.com/project/gallery-app-457314/authentication/providers). Under **Sign-in providers**, open **Google**, switch **Enable**, select `ctolan@gmail.com` as the project support email, then **Save**. The gallery domain is already on Firebase Authentication's authorized-domain list. If Google displays an OAuth consent/contact form, use the same support email; do not change unrelated provider settings.

For initial testing only, the user explicitly authorized `ctolan@gmail.com` as both `SUBMITTER_EMAIL` and `REVIEWER_EMAIL`; the deployed API currently uses this configuration. This is temporary and allows the same account to approve its own submissions, so it does **not** provide independent parent review. Before actual family use, change the submitter to Patrick's Google account and the reviewer to the parent's account. The API enforces exact server-side email allowlists, never client-provided roles.

## Provision and deploy

The project/account and resources are verified; the API is deployed. Do not repeat create steps. The remaining Firebase-console action is enabling Google sign-in as described above. The temporary email allowlist is already configured, with the independence caveat above.

1. After enabling Google provider, test sign-in on the configured web app (`1:151307084226:web:d22cad73f020f0b176b65b`) and verify a Firebase ID token from `ctolan@gmail.com`.
2. Run authenticated live tests against `https://artwork-api-4bigtfzbma-ew.a.run.app`: submit an optimized image, verify it is private/pending, approve, verify only then it becomes reachable in the public catalog, and test spoofed/oversized images. Verify reject remains private and TTL/lifecycle retention is configured. Keep uploads disabled on the frontend until these pass.
3. The approved-media bucket is still private. Only when the API is ready for the approval test, grant `allUsers:roles/storage.objectViewer` to `gallery-app-457314-artwork-approved`. Never grant public access to the pending bucket. Abort if policy rejects public reads; do not weaken an organization policy.
4. Build and deploy the frontend with the public Firebase web-app config and `VITE_ARTWORK_API_URL=https://artwork-api-4bigtfzbma-ew.a.run.app`. First deploy with `VITE_ARTWORK_UPLOAD_ENABLED=false`; preserve the existing static gallery and verify it remains available.
5. Before enabling uploads, verify the 401 unauthenticated case, reviewer restrictions (currently same-account testing only), spoof/size rejection, pending privacy, approve-only publication, rejection privacy, and 14-day retention. Replace the temporary shared account with separate Patrick/parent accounts before relying on independent parent approval.

Cloud Run was built by Cloud Build from the API Dockerfile and deployed with minimum instances 0 and maximum instances 2. Local tests pass. Firebase Google provider setup, authenticated live tests, approved-bucket public grant, and frontend deployment remain outstanding. The live static gallery has not been changed.
