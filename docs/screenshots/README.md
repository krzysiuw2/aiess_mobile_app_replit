# AIESS Mobile App - Screenshots Reference

## Screenshots for Rork AI

Add these screenshots from your Figma to help Rork understand the design.

### How to Export from Figma

1. Open your Figma file
2. Select each frame listed below
3. Right-click → "Export as PNG" (2x resolution recommended)
4. Save with the filename shown below

---

## Required Screenshots (11 Total)

| # | Figma Frame Name | Figma Node ID | Save As |
|---|------------------|---------------|---------|
| 1 | Mobile Sign in | `1:2` | `01_login.png` |
| 2 | Mobile Sign up | `1:233` | `02_signup.png` |
| 3 | Device Choice Page | `28:18` | `03_devices_list.png` |
| 4 | Device Choice Page (Add new device) | `76:628` | `04_devices_add.png` |
| 5 | Live Dashboard | `29:22` | `05_monitor.png` |
| 6 | AI Page (No message) | `60:681` | `06_ai_chat_empty.png` |
| 7 | AI Page (With message) | `60:68` | `07_ai_chat_messages.png` |
| 8 | Schedules | `70:149` | `08_schedules_list.png` |
| 9 | Schedules (Add new rule/Edit rule) | `72:297` | `09_schedules_builder.png` |
| 10 | Analytics | `74:433` | `10_analytics.png` |
| 11 | Settings | `76:546` | `11_settings.png` |

---

## Quick Export Tip (Bulk Export)

In Figma:
1. Select all frames you want to export
2. Go to **File → Export**
3. Choose PNG format at 2x
4. Click **Export**

---

## Screen Descriptions

### 01_login.png
- AIESS logo
- Email/Password fields
- Remember me checkbox
- Forgot password link
- Sign in button (blue)
- Google sign-in button
- Apple sign-in button (will be disabled in v1.0)
- Sign up link

### 02_signup.png
- AIESS logo
- Email field
- Password field
- Retype password field
- Sign up button (blue)
- Sign in link

### 03_devices_list.png
- Header: "Your Devices"
- Device cards with:
  - Name, Site ID, Status badge
  - Specs (Battery Capacity, Battery Power, PV Power)
- "Add new device" button
- Bottom navigation bar

### 04_devices_add.png
- Header: "Add new device"
- Form placeholder (to be added later)
- Confirm button (blue)
- Discard button (red)
- Bottom navigation bar

### 05_monitor.png
- Header: "Your Live Dashboard"
- Status bar (device name, site ID, status)
- Energy flow diagram with:
  - Battery (SoC, Status, Power)
  - Inverter (center)
  - Grid, Factory, PV boxes
  - Flow arrows/lines
- Bottom navigation bar

### 06_ai_chat_empty.png
- Header: "AI Chat" / "Let's talk about your energy!"
- Empty chat area with placeholder message "How can I help you today?"
- Input field "What would you like to know?"
- Mic icon and send button
- Bottom navigation bar

### 07_ai_chat_messages.png
- Header: "AI Chat" / "Let's talk about your energy!"
- Chat bubbles showing conversation history
- AI response tooltips with energy information
- Input field with mic icon
- Bottom navigation bar

### 08_schedules_list.png
- Header: "Schedules" / "Active rules"
- Rule cards with:
  - Rule ID
  - Status badge
  - Edit button
  - Actions column (Type, Power, Max Grid)
  - Time conditions column (Days, Time, Validity)
- "Add new rule" button
- Bottom navigation bar

### 09_schedules_builder.png
- Header: "Schedules" / "Rule builder"
- Back arrow
- Form content (described in add_new_rule_app_guide.md)
- Confirm button (blue)
- Discard button (red)
- Bottom navigation bar

### 10_analytics.png
- Header: "Analytics" / "Your energy flow analysis"
- Time range selector
- Chart area (to be implemented)
- Bottom navigation bar

### 11_settings.png
- Header: "Settings"
- Language setting
- Site limits (P9) setting
- Bottom navigation bar

---

## Notes for Rork

When uploading to Rork:
1. Include all screenshots in chronological order by filename
2. Reference specific screenshots in your prompts
3. The PRD (`template_prd.md`) describes each screen in detail
4. Use screenshots as visual reference, PRD as specification

---

*Export these screenshots and upload them along with the template_prd.md to Rork AI.*

