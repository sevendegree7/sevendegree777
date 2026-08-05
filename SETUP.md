# setup from zero (github + supabase)

you already created github and supabase accounts. do these next.

---

## 1) create the supabase project

1. open https://supabase.com/dashboard
2. new project
3. name it something like `seven-degree-pos`
4. set a database password (save it somewhere safe)
5. choose a region close to you
6. wait until the project is ready

---

## 2) copy your api keys

1. in the project: **project settings** -> **api**
2. copy:
   - **project url**
   - **anon public** key
   - **service_role** key (server only, for admin staff management)
3. in this repo, copy `.env.example` to `.env.local`
4. paste:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

never commit `.env.local`

add the same three values to Vercel. never name the service key with a
`NEXT_PUBLIC_` prefix.

---

## 3) create the database tables

1. supabase dashboard -> **sql editor**
2. open file `supabase/schema.sql` from this project
3. paste all of it into a new query
4. run
5. open `supabase/seed.sql`
6. paste and run (sample menu)
7. open `supabase/phase3.sql` and run
8. open `supabase/phase3-seed.sql` and run (inventory + recipes)
9. open `supabase/public-menu.sql` and run (public qr menu)
10. open `supabase/phase3-fixes.sql` and run (restock function + tighter menu policy)

the steps above describe a brand-new bootstrap. for the already-running
production project, all later database changes use versioned migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

the forward migrations currently in the repo are:

- `supabase/migrations/20260805130000_launch_hardening.sql` — settings, tickets, finished-goods stock, staff flags
- `supabase/migrations/20260805150000_seven_fusions_menu.sql` — replaces the placeholder bakery list with the seven fusions from the brand book
- `supabase/migrations/20260805170000_menu_four_categories.sql` — groups the range into desserts, extras, boxes, and beverages
- `supabase/migrations/20260805190000_global_extras.sql` — makes one admin-created extra reusable across every item
- `supabase/migrations/20260805200000_admin_menu_boxes.sql` — dunkin-style boxes, product create/archive support fields, box stock deduct
- `supabase/migrations/20260805210000_clear_demo_inventory.sql` — removes old bakery flour/cinnabon seed inventory with fixed uuids

do not paste production hot-fixes or edit a migration after it has been applied.

if realtime line fails because it was already added, ignore that one error and continue.

**do not highlight any text before pressing run** — the sql editor runs only the
highlighted part if there is a selection, which silently skips the rest of the file.

---

## 4) create 3 login accounts

for each role (admin, cashier, kitchen):

1. supabase -> **authentication** -> **users** -> **add user**
2. create with email + password (auto confirm user if you see that option)
3. copy the user **uuid**
4. sql editor -> run something like:

```sql
insert into public.profiles (id, name, role)
values
  ('paste-admin-uuid', 'owner', 'admin'),
  ('paste-cashier-uuid', 'cashier', 'cashier'),
  ('paste-kitchen-uuid', 'kitchen', 'kitchen');
```

use the real uuids from auth users.

---

## 5) run the app

```bash
npm install
npm run dev
```

open http://localhost:3000

- admin email -> should open `/admin`
- cashier email -> should open `/pos`
- kitchen email -> should open `/kds`

try opening `/admin` while logged in as cashier -> should bounce back to `/pos`

---

## 6) put the code on github

1. github.com -> **new repository**
2. name: `seven-degree-pos` (public or private)
3. do **not** add readme/license on github (we already have files)
4. in this folder run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/seven-degree-pos.git
git branch -M main
git add .
git commit -m "phase 1 foundation: next.js, schema, auth redirects"
git push -u origin main
```

invite your teammate to the repo after that.

---

## public qr menu

- live page: `/menu` (no login)
- shows only products with `is_available = true` (+ modifiers)
- run once in supabase: `supabase/public-menu.sql`
- when you deploy to vercel, the permanent menu link is:
  `https://YOUR_PROJECT.vercel.app/menu`
- print a qr that points to that full url (or your custom domain later)
- qr codes themselves never expire. do not use temporary short links that die
  in 10 days — use the vercel/custom domain directly

---

## if something fails

- login says no role: profile row missing or wrong uuid
- blank redirect loop: check `.env.local` keys
- cannot read products later: make sure `seed.sql` ran
- public `/menu` empty or error for guests: run `public-menu.sql`
- restock says "run supabase/phase3-fixes.sql in the sql editor first": that file
  has not been applied to this project yet. run it, then retry
