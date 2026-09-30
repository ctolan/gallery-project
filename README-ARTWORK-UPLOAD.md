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

## Provisioning state — not yet performed

The requested target project is `gallery-app-457314`; the documented live site `https://patrick.tolan.ie` responds successfully. The Google Cloud CLI is installed in this workspace at `~/.local/share/google-cloud-sdk/bin/gcloud` (version 587.0.0), but **no Google Cloud account is authenticated here**. As a result, the project/IAM has not been verified and **no GCP/Firebase resources have been created or changed, no service has been deployed, and no end-to-end GCP tests have been run**.

The following resource names are proposed, not confirmed or provisioned:

| Resource | Proposed identifier |
|---|---|
| Cloud Run service | `artwork-api`, region `europe-west1` |
| Pending/rejected bucket | `gallery-app-457314-artwork-pending` |
| Public approved bucket | `gallery-app-457314-artwork-approved` |
| Runtime identity | `artwork-api-runtime@gallery-app-457314.iam.gserviceaccount.com` |
| Firestore | `(default)`, Native mode, `europe-west1` |
| Public gallery origin | `https://patrick.tolan.ie` |
| Cloud Run URL | Not assigned until deployment |

The region is proposed to keep the API, Firestore, and private storage together in Europe. Verify it against the existing project's location/billing policy before creating the database or buckets. Do not proceed if an existing default Firestore database is in a different region, the project description/account is unexpected, the bucket names already belong to unrelated resources, or public bucket access is prohibited by organization policy.

## Required human setup

1. Authenticate the intended administrator in this workspace using `~/.local/share/google-cloud-sdk/bin/gcloud auth login`. Then verify `gcloud auth list` and `gcloud projects describe gallery-app-457314 --format='value(projectId,name,lifecycleState)'` before any provisioning. This branch has not run these commands because no account is authenticated.
2. In Firebase Console, add/confirm Firebase for `gallery-app-457314`, register a web app, enable **Google** as the Firebase Authentication provider, choose the support email, and authorize `patrick.tolan.ie`. Obtain the web app's public Firebase config (`apiKey`, `authDomain`, `projectId`, `appId`). Firebase web config is public client config; never put service-account credentials in Vite variables. Google provider activation/support-email selection may require a human console step.
3. Supply the exact Google email address for Patrick and the parent's reviewer account to the private Cloud Run runtime configuration. The API uses an exact server-side email allowlist (`SUBMITTER_EMAIL`, `REVIEWER_EMAIL`); client input/custom claims cannot grant roles. The two addresses must be distinct and Google-verified.
4. If the project requires first-use billing acceptance or a Google OAuth consent/support contact step, complete that in the Cloud Console; no billing account or consent data is assumed here.

## Provision and deploy after authentication

All commands below are an implementation checklist, **not commands already run**. First confirm the project identity and account as above. These steps enable only Firebase Auth/Firestore/rules, Cloud Storage, Cloud Run, and Cloud Build services required for this design.

1. Enable APIs in the verified project:

   ```sh
   gcloud services enable \
     run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
     storage.googleapis.com firestore.googleapis.com firebase.googleapis.com \
     identitytoolkit.googleapis.com firebaserules.googleapis.com \
     --project=gallery-app-457314
   ```

2. Create Firestore Native `(default)` in the agreed region only if it does not already exist. Apply `firestore.rules` with Firebase CLI (`npx firebase-tools login`, then `npx firebase-tools deploy --only firestore:rules --project gallery-app-457314`). These rules deny every direct client read/write; the API uses its narrowly scoped service identity and the Admin SDK. Enable Firestore TTL on the `submissions.expiresAt` field:

   ```sh
   gcloud firestore fields ttls update expiresAt \
     --collection-group=submissions --enable-ttl \
     --database='(default)' --project=gallery-app-457314
   ```

   Firestore TTL deletion is asynchronous. The storage lifecycle is the media-retention backstop.

3. Create both buckets in the agreed region with uniform bucket-level access. Enforce public-access prevention on the pending bucket and apply `infra/pending-lifecycle.json`. The approved bucket contains only already-approved optimized images and has public object read; add only `allUsers:roles/storage.objectViewer` there. If organization policy rejects that binding, stop; do not weaken organization policy or expose pending objects.
4. Create a dedicated runtime service account. Grant it `roles/datastore.user` for Firestore; `roles/storage.objectAdmin` scoped only to the private pending bucket; and `roles/storage.objectViewer` plus `roles/storage.objectCreator` scoped only to the approved bucket. `roles/firebaseauth.viewer` is needed for revoked/disabled-token checks. Do not create key files. Use an exact-origin `GALLERY_ORIGIN=https://patrick.tolan.ie`.
5. Deploy the API from `api/` with Node 22 and `min=0`, `max=2`, one CPU, 1 GiB memory, concurrency 1, and a request timeout suitable for image re-encoding. It must be reachable by the browser, so Cloud Run ingress is public, but every submit/review route requires a verified Firebase ID token and server-side role check. `/api/gallery` is the only anonymous API route. Set `GCP_PROJECT_ID`, bucket names, exact origin, and the two email allowlist values as runtime configuration.
6. Record the actual Cloud Run URL. Build the frontend with `VITE_ARTWORK_API_URL` and Firebase web config. Keep `VITE_ARTWORK_UPLOAD_ENABLED=false` during setup.
7. Before enabling uploads, test with the real Firebase accounts: anonymous submission gets 401; an incorrect account and submitter cannot review/approve; claimed MIME spoof and per-file/body size excess are rejected by the API; pending URLs cannot be fetched publicly; approve publishes and exposes only sanitized media in the approved catalog; reject moves the object to `rejected/`; lifecycle deletes pending/rejected media after 14 days. Then deploy the static gallery update without removing/changing the existing live gallery and set `VITE_ARTWORK_UPLOAD_ENABLED=true` only after those checks pass.

Cloud Run's minimum instance count is zero, so no API container stays warm between requests. This does not eliminate Cloud Storage, Firestore, build, network, or request charges. No live settings have been changed in this workspace.
