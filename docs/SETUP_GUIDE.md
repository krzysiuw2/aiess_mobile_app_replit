# AIESS Mobile App - Credentials Setup Guide

Complete guide to set up all required API credentials for the mobile app.

---

## 1. Supabase (✅ Ready!)

### What is the Anon Key?

The **anon key** (anonymous key) is a public API key that allows your app to communicate with Supabase. It's safe to include in client-side code because:
- It only allows operations that pass Row Level Security (RLS) policies
- It cannot bypass security rules
- It's meant to be public (like a public API key)

### Your Supabase Credentials

```bash
# Already configured!
EXPO_PUBLIC_SUPABASE_URL=https://fcfuuwmzwxltxsgmcqck.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjZnV1d216d3hsdHhzZ21jcWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjEwMTUsImV4cCI6MjA3ODMzNzAxNX0.q799dSF9CqaBbBokI2OGfvXNNKq9QzwLG0f916AI9Cg
```

### Enable Social Providers in Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/fcfuuwmzwxltxsgmcqck/auth/providers
2. Enable **Google** (we'll add credentials after step 3)
3. Enable **Apple** (we'll add credentials after step 4)

---

## 2. InfluxDB Read-Only Token

### Step-by-Step Instructions

1. **Log in to InfluxDB Cloud**
   - Go to: https://cloud2.influxdata.com/
   - Sign in to your account

2. **Navigate to API Tokens**
   - Click on the **arrow** next to your organization name (top left)
   - Select **API Tokens**
   - Or go directly to: Load Data → API Tokens

3. **Create a New Token**
   - Click **+ Generate API Token**
   - Select **Custom API Token**

4. **Configure Read-Only Permissions**
   
   Set these permissions:
   
   | Resource | Permission |
   |----------|------------|
   | Buckets → `live` | **Read** only |
   | Buckets → `1m` | **Read** only |
   | Buckets → `15m` | **Read** only |
   | Buckets → `1h` | **Read** only |
   
   Leave all other permissions unchecked (especially no Write access!)

5. **Name and Save**
   - Name: `aiess-mobile-app-readonly`
   - Click **Save**
   - **COPY THE TOKEN IMMEDIATELY** (you won't see it again!)

6. **Add to Environment**
   ```bash
   EXPO_PUBLIC_INFLUX_URL=https://eu-central-1-1.aws.cloud2.influxdata.com
   EXPO_PUBLIC_INFLUX_ORG=aiess
   EXPO_PUBLIC_INFLUX_TOKEN=your_new_read_only_token_here
   ```

### Verify Your Token

Test it with this command (replace TOKEN):

```bash
curl --request POST \
  "https://eu-central-1-1.aws.cloud2.influxdata.com/api/v2/query?org=aiess" \
  --header "Authorization: Token YOUR_TOKEN_HERE" \
  --header "Content-Type: application/vnd.flux" \
  --data 'from(bucket: "live") |> range(start: -1m) |> limit(n: 1)'
```

---

## 3. Google OAuth Setup

### Prerequisites
- Google account
- Access to Google Cloud Console

### Step-by-Step Instructions

#### A. Create Google Cloud Project (if you don't have one)

1. Go to: https://console.cloud.google.com/
2. Click the project dropdown (top left)
3. Click **New Project**
4. Name: `AIESS Mobile App`
5. Click **Create**

#### B. Enable Google Sign-In API

1. Go to: https://console.cloud.google.com/apis/library
2. Search for **"Google Identity"** or **"Google Sign-In"**
3. Click **Google Identity Services** or **Google+ API**
4. Click **Enable**

#### C. Configure OAuth Consent Screen

1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Select **External** (unless you have Google Workspace)
3. Click **Create**
4. Fill in:
   - **App name**: AIESS
   - **User support email**: your email
   - **Developer contact**: your email
5. Click **Save and Continue**
6. **Scopes**: Click **Add or Remove Scopes**
   - Select: `email`, `profile`, `openid`
   - Click **Update** then **Save and Continue**
7. **Test users**: Add your email for testing
8. Click **Save and Continue**

#### D. Create OAuth Credentials

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click **+ Create Credentials** → **OAuth client ID**

##### For Web (Required for Supabase)
- Application type: **Web application**
- Name: `AIESS Web Client`
- Authorized redirect URIs: Add `https://fcfuuwmzwxltxsgmcqck.supabase.co/auth/v1/callback`
- Click **Create**
- **Copy the Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)

##### For iOS
- Application type: **iOS**
- Name: `AIESS iOS`
- Bundle ID: `com.aiess.mobile` (or your chosen bundle ID)
- Click **Create**
- **Copy the Client ID**

##### For Android
- Application type: **Android**
- Name: `AIESS Android`
- Package name: `com.aiess.mobile` (must match your app)
- SHA-1 certificate fingerprint: 
  ```bash
  # For debug (development):
  cd android && ./gradlew signingReport
  # Look for SHA1 under "debug" variant
  
  # Or for Expo:
  # Use the Expo-generated fingerprint when you run eas build
  ```
- Click **Create**
- **Copy the Client ID**

#### E. Add to Supabase

1. Go to: https://supabase.com/dashboard/project/fcfuuwmzwxltxsgmcqck/auth/providers
2. Find **Google** and click to expand
3. Toggle **Enable Sign in with Google**
4. Enter your **Web Client ID** and **Client Secret** (from step D)
5. Click **Save**

#### F. Add to Environment

```bash
# Web Client ID (used for sign-in flow)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

---

## 4. Apple Sign-In Setup

### Prerequisites
- Apple Developer Account ($99/year)
- Access to Apple Developer Portal

### Step-by-Step Instructions

#### A. Log in to Apple Developer

1. Go to: https://developer.apple.com/account
2. Sign in with your Apple Developer account

#### B. Create an App ID

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Click the **+** button
3. Select **App IDs** → Continue
4. Select **App** → Continue
5. Fill in:
   - **Description**: AIESS Mobile App
   - **Bundle ID**: Select **Explicit** and enter `com.aiess.mobile`
6. Scroll down to **Capabilities**
7. Check ✅ **Sign In with Apple**
8. Click **Continue** → **Register**

#### C. Create a Services ID (for Web/Supabase)

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Click the **+** button
3. Select **Services IDs** → Continue
4. Fill in:
   - **Description**: AIESS Web Sign-In
   - **Identifier**: `com.aiess.mobile.web` (must be different from App ID)
5. Click **Continue** → **Register**
6. Click on the newly created Services ID
7. Check ✅ **Sign In with Apple**
8. Click **Configure** next to Sign In with Apple
9. Fill in:
   - **Primary App ID**: Select your App ID (com.aiess.mobile)
   - **Domains and Subdomains**: `fcfuuwmzwxltxsgmcqck.supabase.co`
   - **Return URLs**: `https://fcfuuwmzwxltxsgmcqck.supabase.co/auth/v1/callback`
10. Click **Save** → **Continue** → **Save**

#### D. Create a Key for Sign In with Apple

1. Go to: https://developer.apple.com/account/resources/authkeys/list
2. Click the **+** button
3. Fill in:
   - **Key Name**: AIESS Sign In Key
4. Check ✅ **Sign In with Apple**
5. Click **Configure** next to Sign In with Apple
6. Select your **Primary App ID** (com.aiess.mobile)
7. Click **Save** → **Continue** → **Register**
8. **DOWNLOAD THE KEY** (you can only download it once!)
9. Note the **Key ID** shown on the page

#### E. Get Your Team ID

1. Go to: https://developer.apple.com/account
2. Look at the top right - your **Team ID** is shown (10-character code)
3. Or go to Membership and find it there

#### F. Add to Supabase

1. Go to: https://supabase.com/dashboard/project/fcfuuwmzwxltxsgmcqck/auth/providers
2. Find **Apple** and click to expand
3. Toggle **Enable Sign in with Apple**
4. Enter:
   - **Client ID**: Your Services ID (`com.aiess.mobile.web`)
   - **Secret Key**: Contents of the `.p8` file you downloaded
   - **Key ID**: From step D
   - **Team ID**: From step E
5. Click **Save**

#### G. Configure Expo/React Native

In your `app.json`:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.aiess.mobile",
      "usesAppleSignIn": true
    }
  }
}
```

---

## 5. AWS API Gateway (Schedules)

You already have this from your existing setup:

```bash
EXPO_PUBLIC_AWS_ENDPOINT=https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default
EXPO_PUBLIC_AWS_API_KEY=Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW
```

---

## Complete .env File Template

Create a file named `.env` in your app's root directory:

```bash
# =============================================================================
# SUPABASE
# =============================================================================
EXPO_PUBLIC_SUPABASE_URL=https://fcfuuwmzwxltxsgmcqck.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjZnV1d216d3hsdHhzZ21jcWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjEwMTUsImV4cCI6MjA3ODMzNzAxNX0.q799dSF9CqaBbBokI2OGfvXNNKq9QzwLG0f916AI9Cg

# =============================================================================
# INFLUXDB (replace with your read-only token)
# =============================================================================
EXPO_PUBLIC_INFLUX_URL=https://eu-central-1-1.aws.cloud2.influxdata.com
EXPO_PUBLIC_INFLUX_ORG=aiess
EXPO_PUBLIC_INFLUX_TOKEN=your_read_only_token_here

# =============================================================================
# AWS SCHEDULES API
# =============================================================================
EXPO_PUBLIC_AWS_ENDPOINT=https://jyjbeg4h9e.execute-api.eu-central-1.amazonaws.com/default
EXPO_PUBLIC_AWS_API_KEY=Ney5S9g0Fn7zVmIOW1mUs5JycnMbJU5218om1mgW

# =============================================================================
# GOOGLE OAUTH (replace with your client ID)
# =============================================================================
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com

# =============================================================================
# APPLE (configured in app.json, not env)
# Bundle ID: com.aiess.mobile
# =============================================================================
```

---

## Checklist

- [x] **Supabase** - URL and anon key ready
- [ ] **InfluxDB** - Create read-only token
- [x] **Google OAuth** - Set up in Google Cloud Console ✅
- [ ] **Apple Sign-In** - ⏳ Deferred to v1.1 (pending Apple Developer enrollment, ~48h)
- [x] **AWS API** - Already have the key

---

## Quick Links

| Service | Console URL |
|---------|-------------|
| Supabase Dashboard | https://supabase.com/dashboard/project/fcfuuwmzwxltxsgmcqck |
| Supabase Auth Providers | https://supabase.com/dashboard/project/fcfuuwmzwxltxsgmcqck/auth/providers |
| Google Cloud Console | https://console.cloud.google.com/ |
| Google OAuth Credentials | https://console.cloud.google.com/apis/credentials |
| Apple Developer | https://developer.apple.com/account |
| Apple Identifiers | https://developer.apple.com/account/resources/identifiers/list |
| InfluxDB Cloud | https://cloud2.influxdata.com/ |

---

## Troubleshooting

### Google Sign-In Not Working

1. Check that redirect URI matches exactly: `https://fcfuuwmzwxltxsgmcqck.supabase.co/auth/v1/callback`
2. Make sure OAuth consent screen is configured
3. For mobile, ensure SHA-1 fingerprint is correct

### Apple Sign-In Not Working

1. Check Services ID has correct return URL
2. Verify the `.p8` key content is copied correctly
3. Make sure Team ID and Key ID are correct

### InfluxDB Permission Denied

1. Verify token has read access to all required buckets
2. Check org name is correct (`aiess`)
3. Test with curl before using in app

---

*Last Updated: December 1, 2025*

