# seven degree pos

cloud pos for bakery / food truck.

stack: next.js + supabase + vercel (later)

## roles

- admin -> `/admin`
- cashier -> `/pos`
- kitchen -> `/kds`

## phase 1 status

done in code:

- next.js app
- core sql schema + sample menu seed
- login page
- role based redirects and route protection
- empty home screens for pos / kds / admin

you still need to do in the browsers:

1. create supabase project
2. run sql files
3. create 3 auth users + profiles
4. put keys in `.env.local`
5. create github repo and push

full click-by-click steps: see `SETUP.md`

## run locally

```bash
npm install
cp .env.example .env.local
# paste your supabase url and anon key into .env.local
npm run dev
```

open http://localhost:3000

## important folders

- `supabase/` sql for database
- `src/app/login` sign in
- `src/app/pos` cashier screen
- `src/app/kds` kitchen screen
- `src/app/admin` admin screen
- `src/lib/auth` role rules
- `src/lib/supabase` supabase clients
- `src/types/database.types.ts` typescript shapes for tables

## teammate flow

1. push your branch / main to github
2. teammate pulls
3. after they push, you pull and ask cursor: what did he finish?
