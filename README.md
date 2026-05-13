# ChurchFlow

A mobile app for church communities — manage class and volunteer groups, rosters, events, family program registrations, and more.

**Expo 54 (React Native) · TypeScript · Supabase** — runs on iOS and Android from one codebase.

---

## Navigation overview

```
Bottom tabs
├── Groups        — browse all groups; tap your group to enter it
├── News          — BMC In Touch newsletter (Mailchimp RSS)
├── Family        — children and program registrations
└── Profile       — user details, avatar, sign-out; Admin Panel link for admins

Group detail (class group)
├── This Week     — verse of the week, who's leading, reading plan
├── Events        — upcoming events + RSVP
├── Schedule      — month calendar, slot management, birthdays
└── Announcements — notice board

Group detail (volunteer group)
├── Schedule      — month calendar, slot management
└── Announcements — notice board
```

---

## Features

### Groups

Two group types:

- **Class groups** — numbered (Class 38, Class 27, etc.). Each user can belong to **at most one** class group — enforced by a database trigger.
- **Volunteer groups** — free-form name (e.g. "Worship Team"). A user can belong to any number of volunteer groups.

The Groups screen shows two sections: **My Groups** (tap to enter) and **All Groups** (directory view with leader avatars, read-only for non-members).

### This Week *(class groups only)*

- **Verse of the week** — the leader who claimed the slot enters a Bible reference; the app fetches the text from [bible-api.com](https://bible-api.com) in KJV, WEB, OEB, or BBE.
- **Leading this week** — leaders can claim an open slot. The claim is atomic: a concurrent second claim returns "someone else just claimed this slot."
- **Next week** (leaders only) — shows who's leading next week; leaders can pre-claim the slot.
- **Reading plan** — Mon–Fri reading days for the week; Tuesday highlighted when a verse is set.

### Schedule

- Month-view calendar with colour-coded dots (open / claimed / assigned).
- **Class groups:** leaders add meeting dates; any leader can claim an open slot; an admin can override a claim.
- **Volunteer groups:** admins assign slots to volunteers; volunteers accept or decline their own slot.
- Birthdays of group members shown on their day of the month.

### Events *(class groups only)*

- Upcoming events listed in chronological order (past events hidden).
- Any member can RSVP: **Going / Maybe / Not going** with a live going-count.
- Leaders and event creators can edit or delete events.
- Creating an event requires title + date/time; location and description are optional.

### Announcements

Available in both class and volunteer groups.

- Leaders post announcements (title + body).
- All group members can read.
- Leaders can delete their own announcements.
- Updates delivered via Supabase Realtime — no manual refresh needed.

### Church News

Pulls the latest BMC *In Touch* newsletter from the Mailchimp RSS feed. Each issue is shown as a card; tap to read in a full-screen web view.

### Profile

- Display name, birthday, favourite verse, favourite hymn.
- Profile photo — picked from the device library, cropped to square, uploaded to Supabase Storage.
- Save is blocked while a photo upload is in flight to prevent a race condition.
- Admin and Super Admin role badges shown where applicable.

### Family

Parents manage their children and register them for church programs.

- **Add a child** — name and birth year (validated: must be under 18).
- **Programs** — three types with default age ranges:
  - **Youth** — ages 13–18
  - **Children's Church** — ages 4–12
  - **Holiday Club** — open age (no default restriction)
- When registering a child, programs outside the child's age range are shown greyed-out with an "not age-eligible" label so parents can't accidentally enroll a 5-year-old in Youth.
- Admins create and manage programs (name, type, age range, location, dates).

### Admin Panel

Accessible from **Profile → Admin Panel** (admins only).

**CSV bulk import** — one row per user–group assignment:

```
email,group_name,role
alice@example.com,Class 38,leader
bob@example.com,Class 38,member
carol@example.com,Worship Team,member
```

- `email` — must match an existing ChurchFlow account
- `group_name` — created automatically if it doesn't exist; names matching `Class N` create a class group, anything else creates a volunteer group
- `role` — `leader` or `member`

The one-class-group constraint is enforced per row — a clear error is shown if a user would exceed it.

---

## Roles

| Role | How granted | Permissions |
|---|---|---|
| **Member** | Sign up | Read all group content · RSVP events · Claim open schedule slots · Edit own profile · Register children for programs |
| **Leader** | Admin assigns via CSV or DB | All member permissions + add schedule dates · Post/delete own announcements · Create/edit/delete events · Post verse of the week (when leading) |
| **Admin** | SQL bootstrap | All leader permissions + create groups · run CSV import · create and manage youth programs |
| **Super Admin** | SQL bootstrap | All admin permissions; `is_super_admin` also required to change another user's super-admin flag |

A `BEFORE UPDATE` trigger on `profiles` prevents privilege escalation: only an existing admin can set `is_admin`; only an existing super admin can set `is_super_admin`.

---

## Setup

### 1. Install dependencies

```bash
npm install
```


### 2. Configure environment

```bash
cp .env.example .env
```

Fill in from **Project Settings → API**:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### 3. Run

```bash
npm run ios        # iOS Simulator (Mac only)
npm run android    # Android emulator
npm start          # Expo Go on a physical device
```


---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo 54 · managed workflow |
| Language | TypeScript (strict) |
| Navigation | React Navigation v7 — native stack + bottom tabs |
| Backend | Supabase — PostgreSQL · Auth · Realtime · Storage |
| Bible API | [bible-api.com](https://bible-api.com) — KJV, WEB, OEB, BBE (open licence) |
| Calendar | react-native-calendars |

---

## Project layout

```
App.tsx
src/
  theme.ts                    Colour palette, typography, spacing tokens
  types.ts                    TypeScript types matching DB row shapes
  lib/
    supabase.ts               Supabase client (AsyncStorage session persistence)
    bible.ts                  bible-api.com fetcher with 10 s timeout
    week.ts                   weekStart / nextWeekStart date helpers
    newsletter.ts             BMC In Touch RSS fetcher + XML parser
  hooks/
    useAuth.tsx               Auth context — session, isAdmin, isSuperAdmin, recovery flow
    useRealtime.ts            postgres_changes helper (stable channel via useRef)
  context/
    GroupContext.tsx           Provides { group, myRole } to all group-scoped screens
  navigation/
    RootNavigator.tsx         Root stack: MainTabs → GroupDetail, Admin
    GroupNavigator.tsx        Per-group tabs (class: 4 tabs; volunteer: 2 tabs)
  components/
    TabBarIcon.tsx            Ionicons icon map for tab bars
    ErrorBoundary.tsx         Top-level React error boundary
  screens/
    SignInScreen.tsx          Sign in · sign up · password reset request
    PasswordResetScreen.tsx   Deep-link password reset (recovery mode)
    GroupsListScreen.tsx      My Groups / All Groups directory
    ThisWeekScreen.tsx        Verse · slot claim · reading plan
    EventsScreen.tsx          Upcoming events + RSVP
    ScheduleScreen.tsx        Month calendar + slot management + birthdays
    AnnouncementsScreen.tsx   Group notice board
    ChurchNewsScreen.tsx      BMC newsletter card feed
    ProfileScreen.tsx         Profile edit + avatar upload + admin link
    FamilyScreen.tsx          Children + program registration
    AdminScreen.tsx           CSV member import
supabase/
  migrations/
    0001_churchflow_complete.sql   Complete schema — run once on a fresh project
assets/                       App icon, adaptive icon, splash screen
```

---

## Building for the app stores

```bash
npm install -g eas-cli
eas build --platform ios      # requires Apple Developer account ($99/yr)
eas build --platform android  # requires Google Play Console ($25 one-time)
```
