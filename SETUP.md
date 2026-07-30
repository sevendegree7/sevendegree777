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
3. in this repo, copy `.env.example` to `.env.local`
4. paste:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

never commit `.env.local`

---

## 3) create the database tables

1. supabase dashboard -> **sql editor**
2. open file `supabase/schema.sql` from this project
3. paste all of it into a new query
4. run
5. open `supabase/seed.sql`
6. paste and run (sample menu)

if realtime line fails because it was already added, ignore that one error and continue.

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

## if something fails

- login says no role: profile row missing or wrong uuid
- blank redirect loop: check `.env.local` keys
- cannot read products later: make sure `seed.sql` ran
