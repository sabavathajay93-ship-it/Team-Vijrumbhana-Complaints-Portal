# Team Vijrumbhana — Student Voice Portal

A student complaint portal split into three separately deployed parts:

- **Student website (Vercel):** `https://teamvijrumbhana-main-public.vercel.app/`
- **Backend API (Render):** `https://teamvijrumbhana-main.onrender.com/`
- **Admin dashboard (GitHub Pages):** deployed separately from the `admin/` folder. Its final URL will be `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/`.

## Project layout

```text
team-vijrumbhana/
├── frontend/                 # Public student complaint form -> Vercel
│   ├── index.html
│   ├── config.js             # Render API URL
│   ├── home.js
│   └── styles.css
├── backend/                  # Express REST API -> Render
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── scripts/import-json.js
├── admin/                    # Private-use admin UI -> GitHub Pages
│   ├── index.html
│   ├── config.js              # Render API URL
│   ├── admin.js
│   └── styles.css
└── .github/workflows/deploy-admin.yml
```

## How it works

1. A student opens the Vercel link and submits the form.
2. `frontend/home.js` sends JSON to `POST https://teamvijrumbhana-main.onrender.com/api/complaints`.
3. The Render API validates the fields and stores the complaint in PostgreSQL.
4. An administrator opens the separate GitHub Pages link and signs in.
5. The admin page sends an authenticated request to Render to list complaints or update a complaint status.

The admin password and signing secret exist only as Render environment variables. They are never put in the frontend or GitHub Pages files. Admin access is protected by a short-lived signed bearer token (8 hours), held in the browser's `sessionStorage`.

## Where are complaints stored?

**Production storage: Render PostgreSQL**, in a table named `complaints`. The backend creates this table automatically on startup. Each row stores the student name, institution type/name, class, section, roll number, phone, complaint details, status, and submission time.

Do not rely on `backend/data/complaints.json` for production. It is only a local-development fallback when `DATABASE_URL` is not set. Render's normal service filesystem is ephemeral, so local JSON data can disappear after a restart or redeploy. Create a Render PostgreSQL database and set its connection string as `DATABASE_URL` on the backend service.

If you have an old local `backend/data/complaints.json`, you can import it once after creating the database:

```bash
cd backend
npm install
# Set DATABASE_URL in your terminal, then:
node scripts/import-json.js
```

This import script reads the old file from `backend/data/complaints.json`. It does not retrieve a file that existed only on an old Render instance. Export/download any old complaints you still need before replacing the old deployment.

## Deployment guide

### 1. Put this project in a GitHub repository

Upload the complete folder contents, preserving the folder names `frontend`, `backend`, `admin`, and `.github`. Commit and push to the `main` branch. Do not upload `.env`, passwords, database URLs, or other secrets.

### 2. Create the Render PostgreSQL database

1. In the Render dashboard, create a new **PostgreSQL** database.
2. Choose a region compatible with your Render backend service.
3. Copy the database's **Internal Database URL** (recommended when the backend is also on Render).
4. Keep this URL private; add it only as a Render environment variable.

### 3. Deploy the backend on Render

Create a new **Web Service** connected to this GitHub repository:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |

Add these environment variables under the Render service's Environment tab:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | A new, strong, unique admin password |
| `TOKEN_SECRET` | A random secret with at least 32 characters |
| `DATABASE_URL` | Internal Database URL copied from Render PostgreSQL |
| `DATABASE_SSL` | `true` |
| `ALLOWED_ORIGINS` | `https://teamvijrumbhana-main-public.vercel.app,https://YOUR-GITHUB-USERNAME.github.io` |

Replace `YOUR-GITHUB-USERNAME` with your actual GitHub username. Use the origin only (no repository path and no trailing slash) for GitHub Pages. If your Vercel domain changes, update the first origin too. Add any Vercel preview domains only if you actually use them.

Deploy the service. Test this URL in a browser:

`https://teamvijrumbhana-main.onrender.com/api/health`

It should return JSON with `status: "ok"` and `storage: "postgresql"`. If it says `local-json`, the `DATABASE_URL` environment variable is missing or not being read; fix that before accepting real complaints.

### 4. Deploy the student form on Vercel

1. In Vercel, import the same GitHub repository as a new project.
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Other** (static HTML).
4. Build Command: leave empty / override disabled.
5. Output Directory: `.` (the root of the `frontend` folder).
6. Deploy.

`frontend/config.js` already points to the Render API URL. If your backend URL changes, update `API_BASE_URL` there and redeploy Vercel.

Student complaint URL:

`https://teamvijrumbhana-main-public.vercel.app/`

### 5. Deploy the admin dashboard on GitHub Pages

1. In `admin/config.js`, confirm `API_BASE_URL` is `https://teamvijrumbhana-main.onrender.com`.
2. In Render, make sure `ALLOWED_ORIGINS` contains `https://YOUR-GITHUB-USERNAME.github.io` (the origin, not the full project path).
3. Push the repository to GitHub's `main` branch.
4. Open repository **Settings → Pages**.
5. Under **Build and deployment**, choose **GitHub Actions** as the source.
6. The included workflow `.github/workflows/deploy-admin.yml` publishes only the `admin/` folder. Wait for the workflow to complete successfully.
7. Your admin link will be `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/`.

The admin link is separate from the student complaint link. Do not add the admin password to `admin/config.js` or any committed file.

## Local development

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and set ADMIN_PASSWORD and TOKEN_SECRET.
# Leave DATABASE_URL empty to use local backend/data/complaints.json.
npm run dev
```

Open `frontend/index.html` with a local static server (for example VS Code Live Server). For local browser testing, add the exact local origin such as `http://127.0.0.1:5500` to `ALLOWED_ORIGINS`. The admin static files can also be opened through a local static server; set the API URL in `admin/config.js` if the API is not running on the production Render URL.

### Optional WhatsApp notifications

The backend retains the optional WhatsApp Cloud API notification feature. Add `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ADMIN_NUMBER`, and `WHATSAPP_TEMPLATE_NAME` as Render environment variables if you have a configured and approved WhatsApp message template. These are optional; complaint saving works without them. Never commit the token.

## API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | API and storage health |
| `POST` | `/api/complaints` | Public | Submit a student complaint |
| `POST` | `/api/admin/login` | Public (password required) | Obtain admin access token |
| `GET` | `/api/admin/complaints` | Admin token | List complaints |
| `PATCH` | `/api/admin/complaints/:id` | Admin token | Change status to Pending, In Progress, or Resolved |

## Important security notes

- The `.env` file is ignored by Git. Keep all secrets in Render environment variables.
- If a real password or secret was previously committed or shared, rotate it immediately. Do not reuse old credentials.
- Use a strong unique admin password and a randomly generated `TOKEN_SECRET` (at least 32 characters).
- GitHub Pages is public hosting: the admin page source is visible to everyone. This is expected. The dashboard is protected by backend authentication; hiding the URL is not security.
- Student complaint details and phone numbers are sensitive personal information. Restrict admin credentials and database access to authorized people only.
- Render free web services may sleep when idle; the first request after inactivity can take longer. PostgreSQL is the persistent data store, not the web service's local disk.

## Troubleshooting

- **CORS error in browser:** check that `ALLOWED_ORIGINS` contains the exact Vercel origin and GitHub Pages origin, separated by commas, then redeploy the backend.
- **Admin login works but complaints do not load:** verify the admin page `config.js` API URL, backend logs, and that the browser has a valid session token. Sign out and sign in again.
- **Student form says it cannot submit:** open `/api/health`, check the Render service logs, and confirm the Vercel `config.js` API URL.
- **Health endpoint reports `local-json`:** configure `DATABASE_URL` in Render and redeploy. Do not use local JSON as production storage.
- **Admin page returns 404:** enable GitHub Pages with GitHub Actions and check the `Deploy admin dashboard to GitHub Pages` workflow run.

---

Built for Team Vijrumbhana — Student Voice Portal.
