# ChurchFlow

A mobile app for church communities — manage groups, rosters, events, family program registrations, and more. Built with **Expo 54 (React Native)** · **TypeScript** · **Supabase**.

Runs on iOS and Android from one codebase.

---

## Features

| Area | What it does |
|---|---|
| **Groups** | Multi-group architecture — class groups and volunteer groups. Browse all groups and their leaders without joining. |
| **This Week** | Weekly verse (fetched from [bible-api.com](https://bible-api.com) in KJV / WEB / OEB / BBE), who's leading, birthdays this month. |
| **Events** | Members create events; everyone RSVPs (Going / Maybe / Not going) with a live count. |
| **Schedule** | Month-view calendar. Leaders add slots; members claim open slots. Class groups also see Announcements. |
| **Announcements** | Leaders post notices to their group. |
| **Church News** | Pulls the latest BMC *In Touch* newsletter from Mailchimp RSS; shown as a card list, title-only. |
| **Profile** | Display name, birthday, favourite verse/hymn, profile photo (uploaded to Supabase Storage). |
| **Family** | Parents register children for Youth (13–18), Children's (4–12), or Holiday Club programs. |
| **Admin panel** | Super admins bulk-import members and leaders from a CSV file (`email,group_name,role`). |

---

## Roles

| Role | Granted by | Can do |
|---|---|---|
| Member | Sign up | Read group content, claim schedule slots, create events, RSVP, edit own profile, register family members |
| Leader | Admin | Everything a member can + add schedule dates, write weekly verses, post announcements, manage events |
| Admin | SQL bootstrap | Create groups, promote/demote leaders, manage youth programs, view family registrations |
| Super admin | SQL bootstrap | Everything an admin can + CSV bulk-import of members/leaders |

A `BEFORE UPDATE` trigger on `profiles` ensures only existing admins can escalate `is_admin` or `is_super_admin`.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the **SQL editor**, run the single migration file:
   [`supabase/migrations/0001_churchflow_complete.sql`](supabase/migrations/0001_churchflow_complete.sql)
3. In **Authentication → Providers**, ensure **Email** is enabled.  
   For a small private group, turn **"Confirm email" OFF** to skip the inbox round-trip.
4. In **Authentication → URL Configuration**, add `churchflow://reset` as a redirect URL so password-reset deep links route back into the app.
5. In **Storage**, the `avatars` bucket is created by the migration automatically (public, 5 MB limit, images only).

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in from **Project Settings → API** in your Supabase dashboard:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### 4. Run the app

```bash
npm run ios        # iOS Simulator (Mac only)
npm run android    # Android emulator
npm start          # Expo Go on a physical device (scan QR)
```

### 5. Bootstrap yourself as admin

After signing in once, find your UID under **Authentication → Users**, then run in the SQL editor:

```sql
-- Basic admin (create groups, manage leaders)
update public.profiles set is_admin = true where id = '<your-uid>';

-- Super admin (also enables CSV bulk import)
update public.profiles set is_admin = true, is_super_admin = true where id = '<your-uid>';
```

---

## CSV bulk import (Admin panel)

Format — one row per user–group assignment:

```
email,group_name,role
alice@example.com,Sunday Morning Class,leader
bob@example.com,Sunday Morning Class,member
carol@example.com,Worship Team,member
```

- **email** — must match an existing ChurchFlow account
- **group_name** — created automatically if it doesn't exist
- **role** — `leader` or `member`

Access the Admin Panel from **Profile → Admin Panel** (visible to admins only).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo 54 (managed workflow) |
| Language | TypeScript (strict) |
| Navigation | React Navigation v7 (native stack + bottom tabs) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Bible API | [bible-api.com](https://bible-api.com) — KJV, WEB, OEB, BBE (all open-licence) |
| Calendar | react-native-calendars |

---

## Project layout

```
App.tsx                              Entry point — AuthProvider + NavigationContainer
src/
  theme.ts                           Colour palette, typography, spacing tokens
  types.ts                           Shared TypeScript types (DB row shapes)
  lib/
    supabase.ts                      Supabase client (AsyncStorage session)
    bible.ts                         bible-api.com fetcher with 10 s timeout
    week.ts                          Week-start / next-week date helpers
    newsletter.ts                    BMC In Touch RSS fetcher + XML parser
  hooks/
    useAuth.tsx                      Auth context — sign in/up, password reset, admin flag
    useRealtime.ts                   postgres_changes subscription helper (stable channel ID)
  context/
    GroupContext.tsx                 Provides { group, myRole } to group-scoped screens
  navigation/
    RootNavigator.tsx                Root stack: MainTabs + GroupDetail + Admin
    GroupNavigator.tsx               Per-group tabs (class: This Week/Events/Schedule/Announcements;
                                     volunteer: Schedule/Announcements)
  components/
    TabBarIcon.tsx                   Ionicons tab icon map
    ErrorBoundary.tsx                Top-level React error boundary
  screens/
    SignInScreen.tsx                 Email + password sign-in / sign-up / password reset
    GroupsListScreen.tsx             My Groups / All Groups directory with leader avatars
    ThisWeekScreen.tsx               Weekly verse, slot claim, birthday list
    EventsScreen.tsx                 Upcoming events + RSVP
    ScheduleScreen.tsx               Month calendar + slot management + birthday sidebar
    AnnouncementsScreen.tsx          Group notice board
    ChurchNewsScreen.tsx             BMC newsletter card feed
    ProfileScreen.tsx                User profile + avatar upload
    FamilyScreen.tsx                 Children + youth/holiday program registrations
    AdminScreen.tsx                  CSV member import (super admin only)
    PasswordResetScreen.tsx          Deep-link password reset flow
supabase/
  migrations/
    0001_churchflow_complete.sql     Single complete schema — run once on a fresh project
assets/                              App icon, adaptive icon, splash screen
```

---

## Building for the app stores

Uses Expo's managed workflow with [EAS Build](https://docs.expo.dev/eas/):

```bash
npm install -g eas-cli
eas build --platform ios      # requires Apple Developer account ($99/yr)
eas build --platform android  # requires Google Play Console account ($25 one-time)
```
