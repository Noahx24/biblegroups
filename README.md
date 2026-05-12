# BibleGroups

A small mobile app for a single church small group. Built with **Expo (React Native)** + **TypeScript** + **Supabase**. Runs on iOS and Android from one codebase.

## Features (v1)

- Sign in with **Google** or **Apple**
- **This Week** tab — verse of the week (auto-fetched from [bible-api.com](https://bible-api.com)) and who's leading
- **Events** tab — any member can create events; everyone can RSVP (Going / Maybe / No) with a live count
- **Schedule** tab — leader appends meeting dates; members claim the date they want to lead (or release their own claim)
- **Profile** tab — set display name, sign out

Role model: every signed-in user is a group member. One or more users are flagged `is_leader = true` and can edit verses, events, and the schedule.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. In **Authentication → Providers**, enable **Google** and **Apple**.
   - Google: create OAuth credentials in Google Cloud, paste client ID + secret into Supabase.
   - Apple: configure a Services ID + key in your Apple Developer account, paste into Supabase.
4. In **Authentication → URL Configuration**, add `biblegroups://` as a redirect URL.

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

> Apple sign-in requires a real iOS device or simulator and a paid Apple Developer account for distribution. Google sign-in works on both platforms.

### 5. Promote yourself to leader

After signing in once, run this in the Supabase SQL editor:

```sql
update public.profiles set is_leader = true where id = '<your-auth-uid>';
```

You can find your UID under **Authentication → Users** in Supabase.

## Project layout

```
App.tsx                       Entry — wires AuthProvider + NavigationContainer
src/lib/supabase.ts           Supabase client (AsyncStorage-backed session)
src/lib/bible.ts              bible-api.com fetcher
src/lib/week.ts               Week-start date helpers
src/hooks/useAuth.tsx         Auth context (Google + Apple OAuth)
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
