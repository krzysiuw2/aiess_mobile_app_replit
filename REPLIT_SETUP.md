# 🚀 AIESS Mobile App - Replit Deployment Guide

This guide helps you run the Expo dev server 24/7 on Replit so you can use the app on your iPhone via Expo Go without keeping your laptop running.

---

## 📋 Prerequisites

- Replit account (free tier works!)
- Expo Go app installed on your iPhone
- This GitHub repo: https://github.com/krzysiuw2/aiess_mobile_app_replit

---

## 🎯 Setup Steps

### 1. Import to Replit

1. Go to https://replit.com
2. Click **"Create Repl"**
3. Choose **"Import from GitHub"**
4. Paste: `https://github.com/krzysiuw2/aiess_mobile_app_replit`
5. Click **"Import from GitHub"**

### 2. Install Dependencies

Once the Repl opens, click **"Run"** or type in the Shell:

```bash
cd aiess-mobile-energy-app
npm install
```

### 3. Start the Dev Server

The Repl will automatically run:
```bash
npm run start:tunnel
```

You'll see:
- Expo DevTools URL
- A QR code
- Tunnel URL (something like `exp://xyz.your-replit-url.com:443`)

### 4. Connect from iPhone

**On your iPhone:**
1. Open **Expo Go** app
2. Scan the QR code from Replit console, OR
3. Manually enter the tunnel URL

**Your app will load!** 🎉

---

## 🌐 Keep It Running 24/7

### Option 1: Replit Always-On (Paid)
- Upgrade to Replit Hacker plan ($7/month)
- Enable "Always On" for your Repl
- Server never stops

### Option 2: Uptime Robot (Free)
1. Get your Replit URL (e.g., `https://aiess-mobile-app-replit.your-username.repl.co`)
2. Sign up at https://uptimerobot.com (free)
3. Create a monitor that pings your Repl every 5 minutes
4. This keeps the free tier Repl alive

### Option 3: Manual Keep-Alive
- Just keep the Replit tab open in your browser
- Free tier Repls stay alive while the tab is open

---

## 🔧 Troubleshooting

### "Can't connect to dev server"
- Check if Replit console shows "Expo DevTools running"
- Make sure tunnel mode is enabled (`npm run start:tunnel`)
- Try restarting the Repl

### "Tunnel connection failed"
- Replit's ngrok tunnel might be down
- Restart the Repl
- Try a different internet connection on your iPhone

### "Module not found" errors
- Run `npm install` in the Shell
- Clear cache: `npx expo start -c`

---

## 📱 Development Workflow

1. **Edit code** on your laptop (VSCode, Cursor, etc.)
2. **Commit & push** to GitHub
3. **Pull in Replit** Shell: `git pull origin main`
4. **Repl auto-restarts** with your changes
5. **iPhone auto-reloads** the app via Expo Go

---

## 🎓 Important Notes

- **Free Tier Limits:** Replit free tier Repls sleep after inactivity. Use Uptime Robot or upgrade.
- **Performance:** Replit servers can be slower than your laptop for large apps
- **Once Apple Approves:** Build a standalone app with `eas build` and ditch this workaround!

---

## 🔗 Useful Links

- Replit Docs: https://docs.replit.com
- Expo Docs: https://docs.expo.dev
- Uptime Robot: https://uptimerobot.com

---

Happy coding! 🚀

