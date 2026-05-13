# Class Meeting

A mobile app for a Methodist Church of Southern Africa class meeting. Built with **Expo (React Native)** + **TypeScript** + **Supabase**. Runs on iOS and Android from one codebase.

## Features

- Sign in with **email + password**
- **This Week** tab — verse of the week (auto-fetched from [bible-api.com](https://bible-api.com)), who's leading, and a one-tap "I'll lead this week" button for leaders
- **Events** tab — any member can create events; everyone can RSVP (Going / Maybe / No) with a live count
- **Schedule** tab — month-view calendar; leaders tap any date to add it, members tap an open date to claim it
- **Church News** tab — auto-pulls the BMC *In Touch* newsletter from Mailchimp's public RSS feed; latest edition pinned at the top, full content rendered in-app
- **Profile** tab — set display name, favorite verse, favorite hymn; admins manage who's a class leader

## Roles

| Role        | Granted by    | Can do                                                                            |
| ----------- | ------------- | --------------------------------------------------------------------------------- |
| Member      | Sign in       | Read everything, claim/release schedule slots, create events, RSVP, edit own profile |
| Class leader| An admin      | Everything a member can do, plus edit verses, add/remove schedule dates, override claims |
| Admin       | SQL bootstrap | Promote or demote class leaders from the Profile tab                              |

A `BEFORE UPDATE` trigger on `profiles` enforces that only admins can change `is_leader` or `is_admin`, so a member cannot self-promote.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. In the SQL editor, run [`0001_init.sql`](supabase/migrations/0001_init.sql), then [`0002_admin_is_leader.sql`](supabase/migrations/0002_admin_is_leader.sql), then [`0003_profile_birthday.sql`](supabase/migrations/0003_profile_birthday.sql).
3. In **Authentication → Providers**, ensure **Email** is enabled. For a small private class, turn **"Confirm email"** OFF to skip the inbox round-trip.
4. In **Authentication → URL Configuration**, add `classmeeting://reset` as a redirect URL so password-reset links route back into the app.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your Supabase project's **Project Settings → API** page.

### 4. Run the app

```bash
npm run ios       # iOS Simulator (requires Mac)
npm run android   # Android emulator
npm start         # Expo Go on a physical device
```

### 5. Bootstrap yourself as admin

After signing in once, find your UID under **Authentication → Users** in Supabase, then run this in the SQL editor:

```sql
update public.profiles set is_admin = true, is_leader = true where id = '<your-auth-uid>';
```

Now open the app's Profile tab — you'll see a "Manage leaders" section. Toggle the switch next to each class leader to grant them leader powers.

## Theme

Methodist scarlet primary (`#A8232E`) with gold accents (`#C9A961`) on a cream background. Defined centrally in [`src/theme.ts`](src/theme.ts).

## Project layout

```
App.tsx                          Entry — wires AuthProvider + NavigationContainer
src/theme.ts                     Methodist palette + shared style tokens
src/lib/supabase.ts              Supabase client (AsyncStorage-backed session)
src/lib/bible.ts                 bible-api.com fetcher
src/lib/week.ts                  Week-start date helpers
src/hooks/useAuth.tsx            Auth context (email + password + password-reset deep link)
src/navigation/RootNavigator     Tab navigator, gated on auth + recovery mode
src/lib/newsletter.ts            BMC In Touch RSS fetcher + parser
src/screens/                     SignIn, PasswordReset, ThisWeek, Events, Schedule, ChurchNews, Profile
assets/                          App icon, adaptive icon, splash (placeholder Methodist artwork)
supabase/migrations/             SQL schema with row-level security
```

## Building for the app stores

This project uses Expo's managed workflow. Use [EAS Build](https://docs.expo.dev/eas/) to produce store-ready binaries:

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

You'll need an Apple Developer account ($99/yr) for the App Store and a Google Play Console account ($25 one-time) for the Play Store.
