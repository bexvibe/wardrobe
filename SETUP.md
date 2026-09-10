# Connecting the wardrobe to its database

The app now keeps everything in a Supabase project: your items, your saved
outfits, and any photos you upload. Until you do the steps below, opening the
site shows a "Not connected yet" screen rather than your wardrobe.

It takes about ten minutes and you only do it once.

---

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up (the free tier is
   more than enough — this wardrobe uses a few megabytes).
2. **New project**. Give it a name (`wardrobe` is fine), choose a region near
   you (Sydney is the closest to NZ), and set a database password.
   That database password is *not* the one you'll type into the app —
   save it in your password manager and otherwise forget about it.
3. Wait for the project to finish provisioning.

## 2. Create the tables

1. In the left sidebar: **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, paste the whole file in, and
   click **Run**.
3. Do the same with `supabase/seed.sql`. That loads your 80 existing pieces.

Both files are safe to run more than once. Re-running `seed.sql` will *not*
overwrite anything you've since edited in the app.

## 3. Turn off public sign-ups — don't skip this

By default anyone can create an account on a new Supabase project, and this
wardrobe gives every signed-in account full access. Leaving sign-ups on would
let a stranger register their own account and read or change your wardrobe.

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Turn **Allow new users to sign up** *off*. Save.

## 4. Create your login

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: `rebeccastory11@gmail.com`
   (it just has to match `authEmail` in `config.js`, character for
   character — a mismatch fails as "That password did not work", which is a
   misleading message for what is really the wrong address).
3. Password: **this is the password you'll type into the app.** Pick a good
   one and save it in your password manager.
4. Tick **Auto Confirm User**, then create. Without that tick, Supabase waits
   for an email confirmation that will never arrive and the login will fail.

## 5. Point the app at the project

1. **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon / public** key.
3. Paste both into `config.js` in this repo:

```js
window.WARDROBE_CONFIG = {
  supabaseUrl: 'https://xxxxxxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  authEmail: 'rebeccastory11@gmail.com',
};
```

4. Commit and push. Vercel redeploys automatically.

The anon key is meant to be public and is safe to commit — it grants nothing
on its own, because every table requires a signed-in session. **Never** put
the `service_role` key in this file; that one bypasses all security.

---

## What happens the first time you log in

On your phone — the device that has your current data — the app carries
everything across automatically: pieces you'd deleted become archived, your
saved outfits and hidden combinations move into the database, and any photos
you'd uploaded are re-uploaded into storage. You'll see a short "Moved to the
cloud" message when it's done.

The old data stays in your browser afterwards, untouched. It's your backup
until you're happy the database has everything. Nothing clears it but you.

## Things worth knowing

**Nothing is ever deleted.** Archiving a piece sets a timestamp on it instead
of removing the row. Archived pieces live in the **Archive** tab and come back
with one tap. Un-hearting an outfit works the same way — the row stays, so
re-hearting the same combination brings it back.

**Photos.** The 68 photos already in the repo keep being served as static
files. New uploads go to a private storage bucket, downscaled to 1600px first
— previously they were crammed into browser storage as base64 and silently
failed once you'd added a couple.

**Your login is remembered** per device, so you type the password once on your
phone and once on your laptop, not every visit. **Sign out** is at the bottom
of the page.

**To reset the password**, use Authentication → Users in the Supabase
dashboard. Because `authEmail` is a real mailbox you own, the "send password
recovery" option works and emails you a reset link — you do not have to
delete and recreate the account.

A password set here cannot be read back: Supabase stores a one-way hash, so
no screen in the dashboard, the database, or the API will ever show it. If
you forget it, reset it rather than going looking for it.

## If something goes wrong

The app tells you what it can't do rather than failing silently:

- *"Not connected yet"* — `config.js` still has empty values.
- *"Can't reach the wardrobe"* — wrong URL/key, or the project is paused.
  Free projects pause after a week of no use; open the dashboard to resume.
- *"That password did not work"* — check the password, and check that the user
  in step 4 was created with **Auto Confirm User** ticked.
