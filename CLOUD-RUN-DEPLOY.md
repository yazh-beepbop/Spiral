# Deploying Spiral to Google Cloud Run

Spiral is configured with Next.js `output: "standalone"` and a multi-stage `Dockerfile` for **Google Cloud Run**. On Cloud Run, Firestore connects automatically through the service's Application Default Credentials (no service-account JSON file needed), and anonymous sessions are HMAC-signed on the server (no Firebase Web Console setup required).

## 1. Enable required Google Cloud APIs (once per project)

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com
```

## 2. Create the Firestore database (if not already created)

```bash
gcloud firestore databases create --location=asia-south1 --type=firestore-native
```

## 3. Store `GEMINI_API_KEY` in Secret Manager (never in code or image)

```bash
printf "%s" "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

Grant the Cloud Run default compute service account Secret Accessor if prompted:

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 4. Deploy from source to Cloud Run

```bash
gcloud run deploy spiral \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --update-secrets="/secrets/gemini_key=GEMINI_API_KEY:latest" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,GAP_MINUTES=2,DEMO_MODE=true,LOG_LEVEL=info"
```

*(Or bind the `GEMINI_API_KEY` environment variable directly to your `GEMINI_API_KEY` Secret Manager secret in the Cloud Run Deploy UI / `gcloud run services update spiral --region asia-south1`.)*

For production after the sprint demo, set `GAP_MINUTES=600` and `DEMO_MODE=false`.
