# Match Read

Pre-match football analysis app pulling live fixtures and standings from football-data.org.

## How it's set up

- `src/` — the app people see (React)
- `api/football.js` — the "receptionist": a small server function that holds your
  API key privately and fetches data from football-data.org on the app's behalf.
  This avoids exposing your key publicly and avoids browser CORS blocks.

## Deploying on Vercel

1. Push this whole folder to a GitHub repository.
2. Go to vercel.com, sign in with GitHub, and import the repo.
3. Before the first deploy, add an Environment Variable:
   - Name: `FOOTBALL_DATA_API_KEY`
   - Value: your football-data.org token
4. Click Deploy. Vercel will give you a live link (e.g. `match-read.vercel.app`).

Your API key stays on Vercel's servers — it is never sent to anyone visiting the site.
