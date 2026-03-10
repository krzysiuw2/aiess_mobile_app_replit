# AIESS Mobile App - Quickstart Guide for Cursor Agent

> **Purpose**: Instructions for AI agent to develop this React Native app systematically.
> **Read this first** before making any changes to the codebase.

---

## 🎯 Project Goal

Build **AIESS Mobile App v1.0 (MVP)** - a React Native/Expo app for monitoring and controlling Battery Energy Storage Systems (BESS).

### MVP Features (Priority Order)

| # | Feature | Backend | Status |
|---|---------|---------|--------|
| 1 | Authentication (Email + Google) | Supabase Auth | 🔲 TODO |
| 2 | Device List | Supabase DB | 🔲 TODO |
| 3 | Live Monitor Dashboard | InfluxDB HTTP | 🔲 TODO |
| 4 | Schedule Rules (View/Add/Edit) | AWS API Gateway | 🔲 TODO |
| 5 | Analytics Charts | InfluxDB HTTP | 🔲 TODO |
| 6 | Settings (Language, P9 Limits) | Supabase + AWS | 🔲 TODO |

**Apple Sign-In**: Deferred to v1.1 (enrollment pending)

---

## 📁 Documentation Structure

```
docs/
├── PRD.md                 # 📋 MAIN REFERENCE - Full product requirements
├── TEMPLATE_PRD.md        # Original Rork template (for reference)
├── SETUP_GUIDE.md         # API credentials and setup instructions
├── QUICKSTART.md          # This file - agent instructions
├── api/
│   ├── SCHEDULES_API.md   # AWS API Gateway endpoints for schedules
│   └── RULES_SCHEMA.md    # Rule JSON schema (v1.4.1)
├── guides/
│   └── RULE_BUILDER_UX.md # Complete rule builder UI specification
└── screenshots/
    └── README.md          # Figma screenshot reference
```

### Key Documents to Reference

1. **`PRD.md`** - Complete specifications for every screen and feature
2. **`api/RULES_SCHEMA.md`** - Rule structure for schedule management
3. **`api/SCHEDULES_API.md`** - How to GET/POST schedules
4. **`guides/RULE_BUILDER_UX.md`** - Detailed rule builder UI guide

---

## 🛠️ Available Tools

### Supabase MCP ✅ USE THIS

You have access to **Supabase MCP** for backend integration. Use it to:

```
- mcp_supabase_list_tables       # See database schema
- mcp_supabase_execute_sql       # Run queries
- mcp_supabase_get_project_url   # Get API URL
- mcp_supabase_get_anon_key      # Get public key
- mcp_supabase_search_docs       # Search Supabase documentation
```

**Project ID**: `fcfuuwmzwxltxsgmcqck`

### Existing Supabase Tables

| Table | Purpose |
|-------|---------|
| `user_profiles` | User display names, phone, avatar |
| `devices` | Device info (name, site_id, capacity, etc.) |
| `device_users` | User-device relationships (many-to-many) |
| `notifications` | Push notification settings |
| `solar_arrays` | PV array configurations |

**Always use Supabase MCP to verify schema before implementing!**

---

## 📋 Development Workflow

### Step-by-Step Approach

1. **Before each feature**:
   - Read relevant section in `PRD.md`
   - Use Supabase MCP to verify database schema
   - Create a TODO list for the feature

2. **During development**:
   - Implement incrementally
   - Test each component
   - Update `PRD.md` if you discover needed changes

3. **After each feature**:
   - Commit with descriptive message
   - Update feature status in this file
   - Create GitHub milestone if completing a major feature

### Task Management

Use the built-in TODO system to track progress:

```
Example TODO list for Authentication:
- [ ] Set up Supabase client with SecureStore
- [ ] Implement login screen UI
- [ ] Add email/password auth flow
- [ ] Add Google sign-in
- [ ] Add Apple button (disabled, v1.1)
- [ ] Implement session persistence
- [ ] Add logout functionality
- [ ] Test auth flow end-to-end
```

---

## 🔐 Environment Variables

Create `.env` in project root:

```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://fcfuuwmzwxltxsgmcqck.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjZnV1d216d3hsdHhzZ21jcWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjEwMTUsImV4cCI6MjA3ODMzNzAxNX0.q799dSF9CqaBbBokI2OGfvXNNKq9QzwLG0f916AI9Cg

# InfluxDB (read-only token - TO BE ADDED)
EXPO_PUBLIC_INFLUX_URL=https://eu-central-1-1.aws.cloud2.influxdata.com
EXPO_PUBLIC_INFLUX_ORG=aiess
EXPO_PUBLIC_INFLUX_TOKEN=<READ_ONLY_TOKEN_HERE>

# AWS Schedules API
EXPO_PUBLIC_AWS_ENDPOINT=https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default
EXPO_PUBLIC_AWS_API_KEY=Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW

# Google OAuth
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<GOOGLE_CLIENT_ID>
```

---

## 📊 Git & Version Control

### Branch Strategy

```
main                    # Production-ready code
├── develop             # Integration branch
│   ├── feature/auth    # Authentication feature
│   ├── feature/monitor # Live dashboard
│   ├── feature/schedules
│   └── ...
```

### Commit Message Format

Use conventional commits:

```
feat: add login screen with email/password
fix: resolve session persistence issue
docs: update PRD with auth flow changes
style: improve button styling on login
refactor: extract auth logic to useAuth hook
test: add auth flow tests
```

### Commit Frequency

- **Commit after each logical unit** (not too small, not too large)
- **Good**: "feat: implement device list with Supabase query"
- **Bad**: "WIP" or "changes"

### Milestones

Create GitHub milestones for major features:

| Milestone | Features | Target |
|-----------|----------|--------|
| v0.1.0 - Auth | Login, Signup, Session | Week 1 |
| v0.2.0 - Devices | Device list, selection | Week 1 |
| v0.3.0 - Monitor | Live dashboard | Week 2 |
| v0.4.0 - Schedules | Rules list, builder | Week 2-3 |
| v0.5.0 - Analytics | Charts, summaries | Week 3 |
| v0.6.0 - Settings | Language, P9 limits | Week 3 |
| v1.0.0 - MVP | Polish, testing | Week 4 |

### Version Tracking

Update version in `app.json`:

```json
{
  "expo": {
    "version": "0.1.0",
    "ios": { "buildNumber": "1" },
    "android": { "versionCode": 1 }
  }
}
```

---

## 🚀 Implementation Order

### Phase 1: Foundation (Do First!)

1. **Environment Setup**
   - [ ] Create `.env` file with credentials
   - [ ] Verify Supabase connection
   - [ ] Set up lib/supabase.ts client

2. **Authentication**
   - [ ] Login screen (see `PRD.md` section 5.1)
   - [ ] Sign up screen
   - [ ] Auth context/provider
   - [ ] Session persistence with SecureStore

### Phase 2: Core Features

3. **Device List**
   - [ ] Fetch user's devices from Supabase
   - [ ] Device card component
   - [ ] Device selection state

4. **Live Monitor**
   - [ ] InfluxDB HTTP client
   - [ ] Energy flow diagram
   - [ ] 5-second refresh polling
   - [ ] Factory load calculation

### Phase 3: Schedules

5. **Schedule Rules**
   - [ ] GET schedules from AWS API
   - [ ] Rule card component
   - [ ] Rule builder form (complex - see `RULE_BUILDER_UX.md`)
   - [ ] POST rule updates

### Phase 4: Polish

6. **Analytics**
   - [ ] Victory Native XL charts
   - [ ] Time range selector
   - [ ] Data aggregation by bucket

7. **Settings**
   - [ ] i18n setup (EN/PL)
   - [ ] P9 site limits form
   - [ ] Logout

---

## ⚠️ Important Notes

### Things to Remember

1. **Factory Load Formula**: `max(0, grid_power + pv_power + battery_power)`

2. **Rule Priority**: P4-P8 for user rules, P9 for site limits only

3. **Time Format in Rules**: HHMM integer (e.g., 1430 = 14:30)

4. **Weekday Format**: String of digits "12345" = Mon-Fri

5. **Battery Power Sign**: + = charging, - = discharging

6. **Apple Sign-In**: Show button but disabled with "Coming in v1.1"

### Common Pitfalls

- Don't forget to handle loading/error states
- Always use SecureStore for sensitive data (not AsyncStorage)
- InfluxDB returns CSV - need to parse it
- AWS API requires `x-api-key` header
- Test on both iOS and Android

---

## 🔄 Updating PRD

If you discover something needs to change:

1. Make the change in `docs/PRD.md`
2. Add a comment noting what changed and why
3. Commit with message: `docs: update PRD - [what changed]`

Example additions to track:
- New edge cases discovered
- API response format clarifications
- UI adjustments based on implementation

---

## 📱 Testing

### Primary Testing Device

**iPhone 17 via Expo Go** - This is the primary testing device!

```bash
# Start development server
npx expo start

# Then scan QR code with iPhone camera
# Or press 's' to switch to Expo Go mode if needed
```

### Expo Go Setup
1. Install **Expo Go** app from App Store on iPhone
2. Make sure iPhone and dev machine are on **same WiFi network**
3. Scan QR code from terminal with iPhone camera
4. App will load in Expo Go

### Testing Checklist

Before marking a feature complete:

- [ ] Works on iPhone via Expo Go (PRIMARY)
- [ ] Works on iOS simulator (optional)
- [ ] Works on Android emulator (optional)
- [ ] Handles loading states
- [ ] Handles error states
- [ ] Handles empty states
- [ ] Text is translatable (uses i18n keys)

### Test Credentials

For development testing:
- Use your own email to sign up
- Test device: Use existing devices in Supabase (check with MCP)

### Expo Go Limitations

Note: Some features require development builds (not Expo Go):
- Custom native modules
- Push notifications (for v1.1)

For MVP, Expo Go should handle everything we need!

---

## 🎨 Design Reference

Screenshots are in `docs/screenshots/` (or see `screenshots/README.md` for export guide)

**Brand Colors**:
- Primary Blue: `#008cff`
- Success: `#4CAF50`
- Error: `#F44336`
- Warning: `#FF9800`
- Background: `#FFFFFF`
- Surface/Cards: `#F2F2F2`

---

## 📞 Getting Help

If stuck on something:

1. **Check PRD.md** - Most answers are there
2. **Use Supabase MCP** - Query the database directly
3. **Search docs** - `mcp_supabase_search_docs` for Supabase questions
4. **Check API guides** - `api/SCHEDULES_API.md` for AWS integration

---

## ✅ Ready to Start?

1. Read `PRD.md` sections 1-4 for overview
2. Create `.env` file with credentials above
3. Set up Supabase client (`lib/supabase.ts`)
4. Start with Authentication (Phase 1)
5. Commit frequently, update this file's status as you go!

**Good luck! Build something awesome! 🚀**

