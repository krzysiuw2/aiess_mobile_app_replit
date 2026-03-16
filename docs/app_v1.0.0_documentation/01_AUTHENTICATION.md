# 01 — Authentication

## 1. Function Description

The authentication module manages the full user lifecycle: registration, login (email/password + social providers), session persistence, password reset, and account deletion. It gates access to the app via a root redirect and exposes all auth state through a React context.

### Auth Gate (Root Redirect)

The entry point [`app/index.tsx`](../app/index.tsx) acts as a routing gate:

1. While `AuthContext.isLoading` is `true`, a full-screen `ActivityIndicator` is shown.
2. If the user **is authenticated** (`!!session`), redirect to `/(tabs)/devices`.
3. Otherwise, redirect to `/(auth)/login`.

### Login

[`app/(auth)/login.tsx`](../app/(auth)/login.tsx)

| Action | Implementation |
|---|---|
| Email/password sign-in | `supabase.auth.signInWithPassword({ email, password })` via `AuthContext.login()` |
| Google Sign-In | `useGoogleAuth().signInWithGoogle()` — native only (iOS + Android) |
| Apple Sign-In | `useAppleAuth().signInWithApple()` — iOS only |
| Forgot Password | `supabase.auth.resetPasswordForEmail(email)` via `AuthContext.resetPassword()` |
| Navigate to Signup | `router.push('/(auth)/signup')` |

**Client-side validation** runs before every call:
- Email must be non-empty and match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Password must be >= 6 characters.

**Error mapping** converts Supabase error strings into localised messages:

| Supabase message contains | Displayed key |
|---|---|
| `Invalid login credentials` | `t.auth.invalidCredentials` |
| `Email not confirmed` | `t.auth.emailNotConfirmed` |
| `Too many requests` | `t.auth.tooManyAttempts` |

On success the router redirects to `/(tabs)/devices`.

### Signup

[`app/(auth)/signup.tsx`](../app/(auth)/signup.tsx)

| Field | Details |
|---|---|
| Email | `keyboardType="email-address"`, `autoComplete="email"` |
| Password | `secureTextEntry`, minimum 6 chars hint shown below input |
| Retype password | Must match password exactly |
| Google Sign-In | Same `useGoogleAuth` hook as login |
| Apple Sign-In | Same `useAppleAuth` hook as login |
| Link back to login | `router.back()` |

**Post-signup flow:**
- If Supabase returns `user` **without** a `session` (email confirmation required), an alert prompts the user to check their inbox, then navigates to `/(auth)/login`.
- If a session is returned immediately, the user is redirected to `/(tabs)/devices`.

**Error mapping:**

| Supabase message contains | Displayed key |
|---|---|
| `User already registered` | `t.auth.accountExists` |
| `Password should be at least` | `t.auth.passwordTooShort` |
| `Unable to validate email` | `t.auth.invalidEmailFormat` |
| `Signups not allowed` | `t.auth.signupsDisabled` |

### Logout

Triggered from [`app/(tabs)/settings/account.tsx`](../app/(tabs)/settings/account.tsx) via a destructive `Alert.alert` confirmation dialog.

1. Calls `supabase.auth.signOut()`.
2. Clears `session`, `user`, `profile` state.
3. Clears React Query cache (`queryClient.clear()`).
4. Redirects to `/(auth)/login`.

### Delete Account

Also in [`app/(tabs)/settings/account.tsx`](../app/(tabs)/settings/account.tsx), inside a "Danger Zone" section.

**Two-step confirmation:**
1. First: a standard `Alert.alert` with a destructive "Confirm" option.
2. Second: an inline confirmation box appears. The user must type a locale-specific confirmation word (e.g. `USUŃ` / `DELETE`). The delete button stays disabled until the input matches exactly.

**Backend call:**
```
POST {SUPABASE_URL}/functions/v1/delete-account
Authorization: Bearer <access_token>
apikey: <SUPABASE_ANON_KEY>
```

**Client-side cleanup on success:**
- Removes all `@aiess_*` keys from `AsyncStorage`.
- Clears `localStorage`.
- Resets `session`, `user`, `profile` state.
- Clears React Query cache.
- Redirects to `/(auth)/login`.

### Password Reset

Accessed via the "Forgot password?" link on the login screen. If the email field is empty, a hint alert is shown. Otherwise calls `supabase.auth.resetPasswordForEmail(email)` and shows a "Check your email" success alert.

---

## 2. UI / UX Description

### Login Screen

| Element | Details |
|---|---|
| Logo | `<AiessLogo size="large" />` centered at the top |
| Email field | Rounded input (`borderRadius: 16`), label above |
| Password field | Same styling, with eye toggle (`Eye` / `EyeOff` from `lucide-react-native`) for show/hide |
| Remember Me | Custom checkbox (rounded square with `Check` icon when active); default: `true` |
| Forgot Password | Primary-colored text link, right-aligned |
| Sign In button | Full-width, `borderRadius: 30`, primary background, `paddingVertical: 18` |
| Social divider | Horizontal line with "or sign in with" text (only if at least one social button is visible) |
| Google button | Outlined, `borderRadius: 30` — visible on native platforms when env vars are configured |
| Apple button | Black background, white text — visible on iOS only when `isAvailableAsync()` returns true |
| Sign Up link | "Don't have an account? Sign Up" at the bottom |
| Loading states | All buttons show `ActivityIndicator` when their respective mutation is pending; buttons are disabled |
| Keyboard handling | `KeyboardAvoidingView` with `behavior="padding"` on iOS, `"height"` on Android |

### Signup Screen

Same general layout as login with these differences:
- Title + subtitle ("Create Account" heading).
- Password hint text below the password field.
- "Retype Password" field with its own eye toggle.
- Social buttons say "Sign up with …" instead of "Sign in with …".
- Bottom link: "Already have an account? Sign In" → `router.back()`.

### Account Settings Screen

| Element | Details |
|---|---|
| Header | Back arrow + centered title "Account Settings" |
| Edit Profile | Menu item with `User` icon (placeholder, not yet wired) |
| Log Out | Red-tinted button with `LogOut` icon |
| Danger Zone | Red-bordered section with `Trash2` icon delete button |
| Delete Confirm | Inline box: label, centered text input, Cancel / Delete action row |

---

## 3. Backend Description / Tools Used / Tools Needed

### AuthContext

**File:** [`contexts/AuthContext.tsx`](../contexts/AuthContext.tsx)

Built with `@nkzw/create-context-hook` and `@tanstack/react-query` mutations.

#### Session Initialization

```
┌─────────────────────────────────────────────────────┐
│  useEffect on mount                                 │
│                                                     │
│  1. Start 10 s timeout → markInitialized()          │
│  2. supabase.auth.getSession()                      │
│     ├─ success → setSession, setUser, markInit      │
│     └─ error   → markInit (treated as unauthed)     │
│  3. supabase.auth.onAuthStateChange(callback)       │
│     └─ may also markInit if getSession is slow      │
└─────────────────────────────────────────────────────┘
```

- `isLoading` stays `true` until `markInitialized()` is called exactly once (guarded by `initializedRef`).
- A 10-second timeout ensures the app never hangs on a stalled network.

#### Profile Fetch / Create

A separate `useEffect` reacts to `user.id` changes:

1. `SELECT * FROM user_profiles WHERE id = $userId`.
2. If found → set profile state.
3. If Postgres error code `PGRST116` (row not found) → `INSERT INTO user_profiles` with `full_name` derived from the email prefix.

#### Exposed Values

```typescript
{
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;       // !!session
  isLoading: boolean;             // !isInitialized
  isLoginLoading: boolean;
  isSignupLoading: boolean;
  isDeletingAccount: boolean;
  loginError: Error | null;
  signupError: Error | null;
  login: (email, password) => Promise;
  signup: (email, password) => Promise;
  logout: () => Promise;
  resetPassword: (email) => Promise;
  deleteAccount: () => Promise;
}
```

### UserProfile Type

**File:** [`types/index.ts`](../types/index.ts)

```typescript
interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}
```

### Session Persistence

**File:** [`lib/supabase.ts`](../lib/supabase.ts)

```typescript
import 'expo-sqlite/localStorage/install';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,      // expo-sqlite polyfill
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

`expo-sqlite/localStorage/install` provides a synchronous `localStorage` implementation backed by SQLite on native. This replaces `AsyncStorage` for Supabase's auth storage, allowing `getSession()` to resolve synchronously from the local DB.

### Social Auth Hooks

#### Google Sign-In

**File:** [`hooks/useGoogleAuth.ts`](../hooks/useGoogleAuth.ts)

| Step | Detail |
|---|---|
| Module | `@react-native-google-signin/google-signin` (lazy-loaded) |
| Configuration | `GoogleSignin.configure({ webClientId, iosClientId })` — from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| Platform guard | `isNative && !isExpoGo && hasEnvConfig()` |
| Android extra | `GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })` |
| Flow | `GoogleSignin.signIn()` → extract `idToken` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })` |
| Returns | `{ signInWithGoogle, isLoading, isConfigured }` |

#### Apple Sign-In

**File:** [`hooks/useAppleAuth.ts`](../hooks/useAppleAuth.ts)

| Step | Detail |
|---|---|
| Module | `expo-apple-authentication` (lazy-loaded, iOS only) |
| Availability | `isAvailableAsync()` checked on mount |
| Scopes | `FULL_NAME`, `EMAIL` |
| Flow | `signInAsync()` → extract `identityToken` → `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken })` |
| Returns | `{ signInWithApple, isLoading, isAvailable }` |

### Delete Account Edge Function

**File:** [`supabase/functions/delete-account/index.ts`](../supabase/functions/delete-account/index.ts)

**Runtime:** Deno (Supabase Edge Functions)

**CORS:** Shared headers from [`supabase/functions/_shared/cors.ts`](../supabase/functions/_shared/cors.ts) — allows `*` origin.

**Flow:**

```
1. Validate Authorization header
2. Create user-scoped Supabase client → getUser() to extract uid
3. Create admin client (SERVICE_ROLE_KEY)
4. DELETE FROM device_users  WHERE user_id = uid
5. DELETE FROM user_profiles  WHERE id     = uid
6. auth.admin.deleteUser(uid)
7. Return { success: true }
```

Errors at step 4 or 5 are logged but do **not** abort the flow. A failure at step 6 returns HTTP 500.

### Supabase Tables Involved

| Table | Usage |
|---|---|
| `auth.users` | Managed by Supabase Auth — stores credentials, email confirmations, OAuth identities |
| `user_profiles` | App-managed profile data (full_name, phone, avatar_url). Created on first login if missing. |
| `device_users` | Many-to-many join between users and devices (has `user_id`, `role`). Cleaned up on account deletion. |

### Tools / Libraries

| Library | Purpose |
|---|---|
| `@supabase/supabase-js` | Auth API, database queries |
| `expo-sqlite/localStorage` | Synchronous session storage on native |
| `@tanstack/react-query` | Mutations for login/signup/logout/delete |
| `@nkzw/create-context-hook` | Zero-boilerplate context + hook creation |
| `@react-native-google-signin/google-signin` | Native Google Sign-In |
| `expo-apple-authentication` | Native Apple Sign-In (iOS) |
| `@react-native-async-storage/async-storage` | Clearing `@aiess_*` keys on logout/delete |
| `expo-router` | Navigation (`router.replace`, `router.push`, `<Redirect>`) |
| `lucide-react-native` | Icons (`Eye`, `EyeOff`, `Check`, `LogOut`, `Trash2`, `ArrowLeft`, `User`) |

### Environment Variables Required

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous API key |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth web client ID (Android) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth iOS client ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only — used by the delete-account edge function |
