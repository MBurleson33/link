# link

Personal URL shortener with custom slugs. Vercel + Upstash Redis, no dependencies.

- Dashboard: `https://your-project.vercel.app/` (password protected)
- Short links: `https://your-project.vercel.app/your-slug`

## Setup
1. Push this folder to a GitHub repo and import it in Vercel (Framework: Other).
2. Vercel → project → Storage → Create Database → **Upstash for Redis** (free) → connect to this project.
3. Vercel → Settings → Environment Variables → add `ADMIN_PASSWORD`.
4. Redeploy. Open the site, enter your password, start shortening.

## Custom domain later
Vercel → Settings → Domains → add it. Every existing slug keeps working on the new domain.
