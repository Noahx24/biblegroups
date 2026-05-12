# BibleGroups

A small mobile app for a single church small group. Built with **Expo (React Native)** + **TypeScript** + **Supabase**. Runs on iOS and Android from one codebase.

## Features (v1)

- Sign in with **email + password**
- **This Week** tab — verse of the week (auto-fetched from [bible-api.com](https://bible-api.com)) and who's leading
- **Events** tab — any member can create events; everyone can RSVP (Going / Maybe / No) with a live count
- **Schedule** tab — leader appends meeting dates; members claim the date they want to lead (or release their own claim)
- **Profile** tab — set display name, favorite verse, favorite hymn; admins manage who's a leader

## Roles

| Role     | Granted by   | Can do                                                                        |
| -------- | ------------ | ----------------------------------------------------------------------------- |
| Member   | Sign in      | Read everything, claim/release schedule slots, create events, RSVP, edit own profile |
| Leader   | An admin     | Everything a member can do, plus edit verses, add/remove schedule dates, override claims |
| Admin    | SQL bootstrap | Promote or demote leaders from the Profile tab                               |

A `BEFORE UPDATE` trigger on `profiles` enforces that only admins can change `is_leader` or `is_admin`, so a member cannot self-promote.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. In **Authentication → Providers**, ensure **Email** is enabled (it is by default). No OAuth setup needed.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project's **Project Settings → API** page.

### 4. Run the app

```bash
npm run ios       # iOS Simulator (requires Mac)
npm run android   # Android emulator
npm start         # Expo Go on a physical device
```

### 5. Bootstrap yourself as admin

After signing in once, find your UID under **Authentication → Users** in Supabase, then run this in the SQL editor:

```sql
update public.profiles set is_admin = true where id = '<your-auth-uid>';
```

Now open the app's Profile tab — you'll see a "Manage leaders" section. Toggle the switch next to each group leader to grant them leader powers.

## Project layout

```
App.tsx                       Entry — wires AuthProvider + NavigationContainer
src/lib/supabase.ts           Supabase client (AsyncStorage-backed session)
src/lib/bible.ts              bible-api.com fetcher
src/lib/week.ts               Week-start date helpers
src/hooks/useAuth.tsx         Auth context (email + password)
src/navigation/RootNavigator  Tab navigator, gated on auth
src/screens/                  SignIn, ThisWeek, Events, Schedule, Profile
supabase/migrations/          SQL schema with row-level security
```

## Building for the app stores

This project uses Expo's managed workflow. Use [EAS Build](https://docs.expo.dev/eas/) to produce store-ready binaries:

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

You'll need an Apple Developer account ($99/yr) for the App Store and a Google Play Console account ($25 one-time) for the Play Store.
