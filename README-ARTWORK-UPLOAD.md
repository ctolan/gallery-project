# Artwork upload integration draft

## What is implemented in this repo (works today, once deployed)

This is a real page on the live static site, not a prototype: `/submit` (see
`src/pages/ArtworkSubmitPage.tsx`) is a normal client-side route, reachable
from any phone browser at `https://<your-domain>/submit` once this branch is
built and deployed with the existing nginx/Cloud Run setup (`try_files ...
/index.html` in `nginx.conf` already serves any path, including this one, via
the SPA). A "Submit photos" link on the gallery (`/`) also points to it.

On that page, entirely in the browser, before anything is sent anywhere:

- **Capture or choose photos.** Two buttons: "Take a photo" (`capture="environment"`,
  opens the phone camera) and "Choose from library" (`multiple`, opens the
  photo picker). Up to 5 photos per draft.
- **Accept real camera originals.** Each original may be up to 25 MB (typical
  modern phone camera JPEGs/HEIC-converted-JPEGs fit well under this).
- **Resize and re-encode client-side** (`src/features/artwork-upload/resize.ts`).
  `createImageBitmap` decodes the photo (applying any EXIF rotation via
  `imageOrientation: 'from-image'`), a `<canvas>` downsizes it so the longest
  side is at most **2560px** (smaller photos are never upscaled), and
  `canvas.toBlob` re-encodes it as JPEG. Because the canvas only ever holds
  decoded pixels, re-encoding through it drops EXIF metadata as a side
  effect - including GPS/location - without needing a metadata-stripping
  library.
- **Discard the original.** The original `File` is only referenced inside the
  resize call; once it resolves, this page keeps and previews only the
  resized, metadata-stripped blob. The user has explicitly agreed the
  original does not need to be retained, on this device or anywhere else.
- **Validate before and after resizing**
  (`src/features/artwork-upload/validation.ts`): original format/size checks
  before resizing, and a post-resize size/format sanity check before the
  (currently disabled) submit button would be usable.

None of this calls a server. The "Send for parent approval" button is
**permanently disabled** in this draft - there is no upload endpoint to call
yet, and this code intentionally does not fake one. The typed contracts for
that future call live in `src/features/artwork-upload/contracts.ts`
(`ArtworkUploadGateway`, `ArtworkReviewGateway`), built around the optimized
photo shape (`ArtworkDraftPhoto`/`OptimizedArtworkPhoto`), not the original
file.

**Important:** every limit above (file count, 25 MB original cap, 2560px,
8 MB optimized cap, accepted MIME types) is client-side UX only. None of it
is an enforceable security boundary - a modified or scripted client can send
anything. The backend below must independently re-validate everything and
must be the only thing that decides what is safe to store or publish.

## What requires cloud deployment (not deployed, not provisioned)

Use Firebase Authentication with a private Cloud Run API in the existing
Google Cloud project. Verify Firebase ID tokens server-side with
`firebase-admin`; store submission metadata in Firestore and the optimized
pending image in a private Cloud Storage bucket; re-validate/re-encode with
`sharp` server-side too. This fits the existing Google Cloud hosting and
static frontend without exposing storage credentials or accepting uploads at
the nginx layer.

Implement the gateways in `contracts.ts` only after the Firebase project, API
origin, and authorization policy below are agreed and configured. Do not
replace them with unauthenticated direct uploads or client-writable
Firestore/Storage rules.

### Request and approval flow

1. Patrick signs in with an enabled Firebase Authentication account on his
   phone. The page obtains an ID token from Firebase and sends it as a
   bearer token, together with the already-optimized photo(s), title, and
   note, to a dedicated Cloud Run API.
2. The API verifies the token and an explicit `submitter` role. It
   independently re-checks format, dimensions, and size (do not trust that
   the client actually resized/stripped metadata); it caps title/note length,
   file count, and request body size; it decodes and re-encodes the image
   server-side (dropping any metadata that survived) before writing it
   anywhere.
3. The API generates opaque object names and writes only the sanitized output
   to a private pending-review Storage prefix. It stores title, note,
   submitter identity, timestamps, and `pending_review` status in Firestore.
   Reject unexpected fields; never persist location/EXIF metadata.
4. A parent signs in with a distinct `reviewer` role. An authenticated review
   endpoint lists pending submissions and performs an explicit
   approve/reject transition. Only the server may perform this transition;
   log the actor and time and make it idempotent.
5. On approval, the API copies the sanitized image to a separate public
   approved-media location and adds it to the approved gallery catalog. The
   public catalog must query only approved records. Pending objects and
   metadata remain private and must never be reachable through a public
   bucket, static asset path, or public API response.
6. The gallery can fetch the approved catalog from the API once configured.
   Keep the current checked-in gallery (`src/pages/GalleryPage.tsx`) as the
   fallback; do not merge pending records into it.

Use a narrowly scoped Cloud Run service account (private pending-object and
Firestore access only; publish permission limited to the approved-media
location). Deny browser access to Firestore and Storage directly. Do not
create service-account key files. Configure API CORS for the exact gallery
origin, request/rate limits, retention/deletion policy, and audit logging.
Every submission and review route must verify identity and role
server-side; only the approved-media/catalog read route may be anonymous.

## Setup checklist before enabling submissions

1. Confirm the production GCP project, gallery origin(s), API hostname, and
   data-retention policy.
2. Enable Firebase Authentication in that project; choose sign-in method(s)
   and create Patrick's and the parent's accounts. Define a trusted,
   server-side process for assigning/removing `submitter`/`reviewer` custom
   claims. Never grant the reviewer role from browser code.
3. Create a private pending-review bucket/prefix and a separate
   approved-media bucket/prefix. Set lifecycle deletion for
   rejected/abandoned submissions. Keep public read limited to approved
   output only.
4. Create Firestore collections/rules so clients cannot read or write
   submissions directly. Add server-side status validation and an audit
   record for every approval/rejection.
5. Implement and deploy the Cloud Run API: Firebase ID-token verification,
   role checks, independent format/dimension/size validation, server-side
   re-encoding/metadata stripping, and the pending → review → publish flow
   above. Build an authenticated parent review interface (not included in
   this frontend draft).
6. Configure exact-origin CORS, rate limits, monitoring, error handling,
   backup/deletion policy, and least-privilege runtime IAM. Test anonymous
   submission, oversized/spoofed files, direct access to pending objects,
   and approval attempts by a non-reviewer account - all must fail.
7. Add the Firebase web configuration and API origin as deployment-time Vite
   settings (for example `VITE_FIREBASE_*`, `VITE_ARTWORK_API_URL`). Firebase
   web configuration is public client configuration, not a secret; all
   administrative credentials stay server-side. Rebuild and deploy only
   after environment-specific values and security rules have been reviewed.
8. Wire `ArtworkUploadGateway`/`ArtworkReviewGateway` to the real endpoints
   and enable the "Send for parent approval" button. Verify a submission is
   invisible to the public catalog before approval and appears only after
   approval. Until these checks pass, keep the button disabled and the
   current static gallery unchanged.

No cloud resources, settings, accounts, credentials, or deployment
configuration have been created or changed by this draft.
