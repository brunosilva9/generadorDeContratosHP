# PDF conversion server

Gotenberg (LibreOffice) wrapped with Caddy for CORS. Converts `.docx` →
`.pdf` with full Word fidelity (line shapes, multi-column sections, etc.)
since it's a real LibreOffice rendering, not the in-browser approximation.

## Local

```sh
docker compose up --build
```

Now `http://localhost:8080/forms/libreoffice/convert` accepts multipart `.docx`
uploads. Test:

```sh
curl -F "files=@some.docx" -F "merge=true" \
  http://localhost:8080/forms/libreoffice/convert -o out.pdf
```

To use with the frontend in dev:

```sh
VITE_PDF_API_URL=http://localhost:8080 npm run dev
```

## Deploy to Cloud Run

Pre-requisites: gcloud CLI installed and authenticated (`gcloud auth login`),
a project selected, billing enabled, and the Cloud Run + Cloud Build APIs
enabled (the first deploy enables them automatically).

```sh
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1
SERVICE=pdf-convert

gcloud run deploy "$SERVICE" \
    --source=. \
    --region="$REGION" \
    --memory=2Gi \
    --cpu=2 \
    --timeout=120s \
    --max-instances=5 \
    --concurrency=4 \
    --allow-unauthenticated
```

Notes:
- `--source=.` makes Cloud Run build the image with Cloud Build (uses
  the `Dockerfile` next to this README).
- `--memory=2Gi` is comfortable for LibreOffice; less can OOM on big docs.
- `--concurrency=4` because LibreOffice is single-threaded per conversion
  and we don't want the instance overwhelmed.
- `--allow-unauthenticated` makes the service public. CORS in `Caddyfile`
  is `Access-Control-Allow-Origin: *`. If you want to lock down to specific
  origins (e.g. `https://brunosilva9.github.io`), edit `Caddyfile` and
  redeploy.

After the deploy, gcloud prints the service URL (e.g.
`https://pdf-convert-abc123-uc.a.run.app`). Put that in the frontend env:

- Local dev: `.env.local` with `VITE_PDF_API_URL=https://pdf-convert-...run.app`
- Production: GitHub repo → Settings → Secrets and variables → Actions →
  Variables → New repository variable `VITE_PDF_API_URL` = the service URL.
  The deploy workflow already reads it.

## Cost

Cloud Run scale-to-zero. With the free tier (2 M requests / 360k vCPU-seconds
per month) typical personal use is free. Idle = $0. Cold start is ~3-5s
because the image is ~1.5 GB.
