# Fluent · IELTS study space (Vercel + Supabase edition)

Static React app hosted on Vercel. Supabase provides sign-in, the database and private PDF storage. No Docker, no server to manage.

## 1. Create the Supabase project (free)

1. Sign up at https://supabase.com and click **New project**. Pick a nearby region and save the database password.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. This creates the tables, the private `study-pdfs` bucket and the security rules.
3. **Authentication → Providers → Email**:
   - Set the minimum password length to **12**.
   - For personal use, turn **off** "Confirm email" so sign-up logs you in immediately. (If you leave it on, new users must click an email link first. Supabase's built-in email sender is heavily rate-limited.)
4. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**.

## 2. Run it locally

```sh
cp .env.example .env.local     # then paste the two values into .env.local
npm install
npm run dev
```

Open http://localhost:5173 and create an account.

## 3. Deploy on Vercel (free)

1. Put this folder in a GitHub repository (`.env.local` is git-ignored; never commit keys you consider private).
2. At https://vercel.com choose **Add New → Project**, import the repository. Vercel detects Vite automatically.
3. Under **Environment Variables** add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You get a free `https://<name>.vercel.app` address with HTTPS.
5. In Supabase, **Authentication → URL Configuration**, set **Site URL** to your Vercel address (needed for email links if you keep confirmation on).

Open the Vercel address on your laptop and phone, sign in, and use "Add to Home Screen" to install it.

## Notes

- The anon key is meant to be public. Row Level Security in `schema.sql` stops one account reading another's study plan or PDFs.
- Free Supabase projects pause after a period of inactivity; open the dashboard to resume. Check Supabase's current free-tier limits (storage, bandwidth) before relying on it.
- Accounts from the old Docker/FastAPI version are not migrated; register again here.
