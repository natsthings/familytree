# familytree
# 🌳 Family Tree

An interactive family tree app built with Next.js, Supabase, and React Flow. Deployed on Vercel.

## Features

- 🔐 Username/password authentication
- 🌳 Interactive drag-and-drop family tree
- 🔗 Add relationships: parent, child, spouse, sibling, or custom
- 💾 Auto-saves node positions when you rearrange the tree
- ➕ Add family members relative to any person on the tree
- 🔗 Link existing members together without duplicating

---

## Setup Guide

### 1. Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In your project dashboard, go to **SQL Editor**
3. Copy and paste the contents of `supabase/schema.sql` and run it
4. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Local Development

```bash
# Clone your repo
git clone https://github.com/yourusername/your-repo
cd your-repo

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local and paste your Supabase URL and anon key

# Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your GitHub repo
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**

That's it! Vercel auto-deploys on every push to main.

---

## How to Use

### Getting started
1. **Register** with your email and name — you become the root of the tree (marked with ★)
2. Your card appears on the canvas. Double-click it to edit your details.

### Adding family members
- Click **Add member** (top right) to add someone unconnected
- Click the **+** button on any member's card to add a relative and define the relationship
- When connecting, you can either create a new person or link an existing member

### Navigating the tree
- **Drag** members to rearrange — positions save automatically
- **Scroll/pinch** to zoom
- **Click and drag** the background to pan
- Use the **minimap** (bottom left) for overview navigation

### Relationship types
| Type | Description |
|------|-------------|
| Parent | Draws an arrow parent → child |
| Child | Draws an arrow child ← parent |
| Spouse | Dashed animated line |
| Sibling | Blue line |
| Other | Custom label (e.g. "Godfather") |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database + Auth | Supabase (Postgres + Row Level Security) |
| Tree Canvas | React Flow |
| Styling | Tailwind CSS |
| Hosting | Vercel |


my user: nataliabern2007nb@gmail.com
my password: 5223987C

xevian: xbern777@gmail.com
password: Penguiny777
