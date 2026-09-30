README - Build & Deploy Gallery Project

This README retains historical static-gallery deployment notes from 2025-09-20. Verify the active project, service, and region before using those commands. The artwork upload/auth/review design and current deployment status are documented in [README-ARTWORK-UPLOAD.md](README-ARTWORK-UPLOAD.md).

Files changed
- src/pages/GalleryPage.tsx
  - Updated local image references to new filenames in `public/images`.
- app.yaml
  - Created/updated to configure App Engine static serving and set runtime to nodejs20.

Workflow - add new images locally
1. Put your new image files in `public/images/` (overwrite existing filenames or add new names).
2. Update the `galleryImages` array in `src/pages/GalleryPage.tsx` to reference the new filenames. Example:

   const galleryImages = [
     { id: '1', url: '/images/20250920_090826.jpg', title: 'New Image 1' },
     { id: '2', url: '/images/20250920_090836.jpg', title: 'New Image 2' },
     { id: '3', url: '/images/20250920_090846.jpg', title: 'New Image 3' },
   ];

This repository workflow is for trusted maintainers changing the site bundle. Do not use it for Patrick's photo submissions: files in `public/` are published with the site and do not have an approval gate. The mobile `/submit` and parent `/review` routes and secured API are implemented. Firebase Google sign-in is enabled and verified; approved photos are served through the API while both buckets stay private. The frontend is still undeployed and sending disabled pending authenticated end-to-end checks and separate authorization. See [Artwork upload integration](README-ARTWORK-UPLOAD.md).

Local testing
- Install dependencies (if needed):

```powershell
npm install
```

- Run development server:

```powershell
npm run dev
```

Open the local URL (usually http://localhost:3000) to confirm images show correctly.

Build (production)
- Build the Vite/React production bundle:

```powershell
npm run build
```

This creates the `dist/` folder with static files.

Deploy to App Engine (optional)
- Ensure `app.yaml` exists at project root. The project used these contents:

```yaml
runtime: nodejs20
env: standard

handlers:
  - url: /(.*)
    static_dir: dist
```

- Deploy:

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud app deploy --quiet
```

Notes: App Engine was used for a quick static deployment earlier, but Cloud Run was chosen for the final service in this session.

Deploy to Cloud Run (recommended for this project)
1. Build a container image and push to Google Container Registry (replace PROJECT_ID):

```powershell
# from project root
gcloud builds submit --tag gcr.io/PROJECT_ID/gallery-app
```

2. Deploy to Cloud Run:

```powershell
gcloud run deploy gallery-app --image gcr.io/PROJECT_ID/gallery-app --platform managed --region us-central1 --allow-unauthenticated
```

3. Confirm the service URL returned by the deploy command and open it to verify the updated site.

Map a custom domain (patrick.tolan.ie)
1. Ensure the parent domain (`tolan.ie`) is verified in your Google account (Search Console / Cloud Console Domain Verification). If not, verify it by adding the TXT record Google provides.

2. Create a domain mapping (beta command for fully managed Cloud Run):

```powershell
gcloud beta run domain-mappings create --service=gallery-app --domain=patrick.tolan.ie --platform managed --region us-central1
```

The command will print DNS records you must add. For the subdomain `patrick.tolan.ie` the output was:

- Name: patrick
- Type: CNAME
- Value: ghs.googlehosted.com.

3. Add that CNAME in your DNS provider for the `patrick` subdomain.
4. Wait for DNS to propagate and for Google to provision an SSL certificate (can take minutes or hours). Check mapping status:

```powershell
gcloud beta run domain-mappings list --platform managed --region us-central1
```

Files created/edited during session
- app.yaml (created/updated)
- src/pages/GalleryPage.tsx
- README-DEPLOY.md (this file)

Troubleshooting
- If you get a certificate provisioning error, ensure DNS is correct (CNAME to ghs.googlehosted.com).
- If Cloud Run domain-mapping complains the domain isn't verified, verify it in Google Search Console or the Cloud Console Domain verification page before mapping.

If you'd like, I can also:
- Create a Git tag/release with the updated image filenames.
- Push the built Docker image and run the Cloud Run deploy commands again with your project ID filled.
- Provide exact DNS provider steps for Cloudflare/GoDaddy/Namecheap.

Finished on: 2025-09-20
