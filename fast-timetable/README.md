# FAST NUCES Timetable App 🎓
**Karachi Campus — Spring 2026**

## 🚀 Quick Start

1. Open `index.html` in VS Code
2. Install **Live Server** extension in VS Code
3. Right-click `index.html` → **"Open with Live Server"**
4. Done! App loads live data from Google Sheets automatically.

---

## 📌 IMPORTANT: Fix Sheet GIDs

The app fetches each day's sheet using a **GID** (Google Sheet tab ID).
You need to verify/update these in `js/app.js` (top of file):

### How to find GIDs:
1. Open the Google Sheet: https://docs.google.com/spreadsheets/d/1sivXTIf9JvaqP2k6B7-468SyZXTcOAvKyyVW4HJRxeQ
2. Click on the **MONDAY** tab → look at the URL:
   `...edit#gid=212334121`  ← that number is the GID
3. Do the same for TUESDAY, WEDNESDAY, THURSDAY, FRIDAY

### Update in app.js:
```javascript
const gids = {
  MONDAY:    '0',           // ← replace with actual GID
  TUESDAY:   '838584571',   // ← replace with actual GID
  WEDNESDAY: '1282784428',  // ← replace with actual GID
  THURSDAY:  '677765118',   // ← replace with actual GID
  FRIDAY:    '212334121',   // ← replace with actual GID
};
```

---

## ✨ Features
- 🔴 **Live data** — auto-updates when university changes the sheet
- 🔍 **Instant search** — by section (BCS-6B), teacher name, course code
- ⭐ **My Classes** — save your personal timetable (persists in browser)
- 👨‍🏫 **Teachers** — browse all faculty & their schedules
- 🚪 **Free Rooms** — find available rooms by day & time slot
- 🌙 **Dark/Light mode** toggle
- 📱 **Mobile responsive** with bottom navigation

---

## 🌐 Deploy to Vercel (Free)
1. Create account at vercel.com
2. Install Vercel CLI: `npm i -g vercel`
3. In this folder run: `vercel`
4. Done! You get a live URL to share with classmates.

**OR** just drag & drop this folder to vercel.com/new

---

## 📁 Project Structure
```
fast-timetable/
├── index.html       ← Main app (single page)
├── css/
│   └── style.css    ← Dark glassmorphism UI
├── js/
│   └── app.js       ← All logic + Google Sheets fetch
└── README.md
```

---

## ⚠️ CORS Note
If you open `index.html` directly (double-click), the fetch will fail due to browser CORS policy.
Always use **Live Server** in VS Code or deploy to Vercel.
