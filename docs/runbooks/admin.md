# First-party admin desk

Attached to normal Garage Talk sign-in. No separate admin password and no public self-serve tier endpoint.

## How to log in

Open `/admin` on the app. The desk has its own username/email + password form. Use the same Garage Talk account Jeremy or Joe already use. After a successful operator sign-in, the subscriber list stays on `/admin`.

## Who can open it

- Jeremy Spoon: email `spoon.jeremy@gmail.com`, or username `jeremy` / `jspoon5`
- Joseph Beaver (Joe): username `joe` / `joseph` / `josephbeaver` / `jbeaver`, or any email listed in `ADMIN_EMAIL` / `ADMIN_EMAILS`

Session cookie is the gate. TOTP is only required if that operator already has `admin_totp_secret` set. Testers are never admins.

## What it does

- Lists users (email, username, stored tier)
- Shows a small subscriber snapshot (users, paid, Pro, active subs)
- Grants or revokes Pro by writing a **manual** entitlement (`provider=manual`, id `manual:<userId>`)
- Audits the change

It does **not** create Stripe customers, subscriptions, or live charges. Worldwide tracking, influencer/affiliate, and marketing upgrades are out of scope.

`PATCH /admin/users/:id/tier` is admin-session only. Unauthenticated calls return 401.

## Tester Pro for Joe’s QA

Boot seed:

1. Ensures `tester` / `tester2` can still log in (`GarageTalkTest1`)
2. If `tester@garagetalk.app` has **no** manual entitlement yet, grants Pro once
3. Leaves `tester2` on Free so unpaid QA still has an account

If Joe later revokes tester in the desk, later boots will **not** re-grant. Re-grant from the desk, or delete the manual entitlement row and restart.

`ensureAmateurTester` repairs login only. It no longer forces testers back to amateur.

## Env

```bash
ADMIN_EMAIL=joe@example.com
ADMIN_EMAILS=joe@example.com,ops@garagetalk.app
ADMIN_USERNAMES=josephbeaver
```

Do not put tester emails or usernames here.
