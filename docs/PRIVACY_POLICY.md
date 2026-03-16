# Privacy Policy

**AIESS — AI Energy Storage System**
**Effective date:** March 15, 2026
**Last updated:** March 15, 2026

---

## 1. Who We Are

AIESS ("we", "us", "our") is an AI-powered energy storage management application developed and operated by AIESS. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use the AIESS mobile application ("the App").

**Contact:** privacy@aiess.pl
**Website:** https://aiess.pl

---

## 2. What Data We Collect

### 2.1 Account Data

When you create an account, we collect:

- **Email address** — used for authentication and account recovery.
- **Full name** (optional) — used for display within the App.
- **Phone number** (optional) — stored in your profile if you choose to provide it.
- **Profile photo** (optional) — stored as a URL reference if you choose to upload one.

If you sign in with **Apple** or **Google**, we receive only the identity information those providers share (typically email and name). We do not receive or store your Apple or Google password.

### 2.2 Site & Device Data

When you pair an energy device with the App, we collect:

- **Device identifiers** — serial number and site ID, used to associate your account with your energy system.
- **Site configuration** — technical parameters you enter (battery specs, inverter specs, PV arrays, grid connection details, safety limits, operating mode, schedules).
- **Site address and GPS coordinates** — entered manually by you for solar forecasting and weather data. We do **not** access your device's GPS or location services.

### 2.3 Energy Telemetry

Your energy storage device transmits operational data (power flows, state of charge, grid import/export, PV production) to our servers. This data is associated with your **site**, not your personal identity, and is used to power the monitoring dashboard, analytics, and AI optimization.

### 2.4 Data Processed On-Device Only (Not Collected)

- **Camera** — used solely to scan QR codes when adding a device. Camera frames are processed on-device and are never transmitted or stored.
- **Microphone & speech recognition** — used for optional voice input in the AI chat. Audio is processed by your device's operating system speech API and is never sent to our servers.

### 2.5 AI Chat

Conversations with the AI assistant are processed in real time to generate responses. Chat sessions are **ephemeral** and are not permanently stored on our servers. A local copy of recent chat history is stored on your device for convenience and is deleted when you delete your account.

---

## 3. How We Use Your Data

We use the data we collect to:

- **Provide the service** — authenticate you, display your energy system status, and enable device management.
- **Optimize energy usage** — the AI agent uses site configuration and telemetry data to create schedules and recommendations.
- **Deliver analytics** — generate financial analysis, battery health reports, and energy flow visualizations.
- **Improve the App** — diagnose technical issues and improve functionality (we do not use your data for advertising or profiling).

---

## 4. Where Your Data Is Stored

All data is stored on servers located within the **European Union**:

| Data | Service | Region |
|------|---------|--------|
| Account & profile | Supabase | EU West (Ireland) |
| Authentication | Supabase Auth | EU West (Ireland) |
| Device–user associations | Supabase | EU West (Ireland) |
| Site configuration | AWS DynamoDB | EU Central (Frankfurt) |
| Energy telemetry | InfluxDB on AWS | EU Central (Frankfurt) |
| AI chat processing | AWS Bedrock | EU Central (Frankfurt) |

---

## 5. Third-Party Services

We use the following third-party services to operate the App:

- **Supabase** (supabase.com) — authentication, user profiles, and device–user associations. [Supabase Privacy Policy](https://supabase.com/privacy)
- **Amazon Web Services (AWS)** — site configuration storage, energy telemetry, AI processing. [AWS Privacy Policy](https://aws.amazon.com/privacy/)
- **Apple Sign-In** — optional authentication method. [Apple Privacy Policy](https://www.apple.com/legal/privacy/)
- **Google Sign-In** — optional authentication method. [Google Privacy Policy](https://policies.google.com/privacy)

We do **not** use any advertising networks, analytics trackers, or data brokers. We do **not** sell, rent, or share your personal data with third parties for marketing purposes.

---

## 6. Data Retention

- **Account data** is retained for as long as your account is active.
- **Energy telemetry** is retained for as long as the site is active, as it may be shared with other users who have access to the same site.
- **AI chat history** (local only) is retained on your device until you delete your account or clear app data.

When you delete your account (see Section 7), your personal data (profile, email, device associations) is permanently removed from our systems. Site-level data (telemetry, configuration) may be retained if other users share access to the same site.

---

## 7. Account Deletion

You can delete your account at any time from within the App:

**Settings → Account Settings → Delete My Account**

This will permanently delete:
- Your user profile (name, email, phone, avatar)
- Your device–user associations
- Your authentication record
- Local data stored on your device (chat history, preferences)

Site-level data (energy telemetry, site configuration) is not deleted because it may be shared with other users. To request deletion of site data, contact us at privacy@aiess.pl.

---

## 8. Your Rights (GDPR)

If you are located in the European Economic Area (EEA), you have the following rights under the General Data Protection Regulation (GDPR):

- **Access** — request a copy of the personal data we hold about you.
- **Rectification** — request correction of inaccurate data.
- **Erasure** — request deletion of your personal data (see Section 7).
- **Restriction** — request that we limit the processing of your data.
- **Data portability** — request your data in a structured, machine-readable format.
- **Objection** — object to processing of your data for specific purposes.

To exercise any of these rights, contact us at **privacy@aiess.pl**. We will respond within 30 days.

You also have the right to lodge a complaint with a supervisory authority. In Poland, this is the **Urząd Ochrony Danych Osobowych (UODO)** — https://uodo.gov.pl.

---

## 9. Data Security

We implement appropriate technical and organizational measures to protect your data, including:

- All data in transit is encrypted using TLS/HTTPS.
- Authentication tokens are stored securely on your device.
- Server-side access to user data requires authenticated API calls.
- Administrative access to databases is restricted and audited.

---

## 10. Children's Privacy

The App is not intended for use by children under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us at privacy@aiess.pl and we will delete it.

---

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date at the top of this page. For significant changes, we will notify you through the App or by email.

---

## 12. Contact Us

If you have any questions about this Privacy Policy or our data practices, contact us at:

**Email:** privacy@aiess.pl
**Website:** https://aiess.pl/aiess-app/privacy
