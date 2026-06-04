# 🚀 Deployment Guide - Shine Cosmetics BOS

## ✅ Phase 1 Complete - What's Built

- ✅ Next.js 16 project structure
- ✅ TypeScript configuration
- ✅ Tailwind CSS setup
- ✅ Database connection (shared with website)
- ✅ Authentication (founders only)
- ✅ Sendit API keys configured
- ✅ Database migrations ready

---

## 📋 STEP 1: Install Dependencies (2 minutes)

```bash
cd C:\Users\AchrafMekouar\Desktop\parashop-ops
npm install
```

---

## 📋 STEP 2: Run Database Migration (3 minutes)

**Option A: Using Neon SQL Editor (Easiest)**

1. Go to https://console.neon.tech
2. Select your `neondb` database
3. Open **SQL Editor**
4. Copy entire content of `migrations/001_add_bos_tables.sql`
5. Paste and click **Run**
6. Verify: Should see 14 new tables created

**Option B: Using psql Command Line**

```bash
# From parashop-ops directory
psql "postgresql://neondb_owner:npg_BrRNZc7QAD0j@ep-withered-tree-abeitjt9-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require" -f migrations/001_add_bos_tables.sql
```

---

## 📋 STEP 3: Test Locally (2 minutes)

```bash
npm run dev
```

Open: http://localhost:3001

**Expected:**
- See "Shine BOS" header
- See "Executive Dashboard" page
- See "Phase 1: Foundation Complete" message

**If you see errors:**
- Check DATABASE_URL in `.env`
- Check Node version: `node -v` (should be 18+)
- Run: `npm install` again

---

## 📋 STEP 4: Create GitHub Repo (2 minutes)

1. Go to: https://github.com/new
2. **Repository name:** `parashop-ops`
3. **Owner:** `Href01`
4. **Private:** ✅ Yes
5. **Do NOT** initialize with README
6. Click **Create repository**

Then run:

```bash
cd C:\Users\AchrafMekouar\Desktop\parashop-ops
git init
git add .
git commit -m "feat: Phase 1 - BOS Foundation

✅ Next.js 16 + TypeScript + Tailwind
✅ Shared database connection with website
✅ Founders-only authentication (mekouar01@gmail.com, marjanhajar20@gmail.com)
✅ Sendit API keys configured
✅ 14 new BOS tables (SenditShipment, Campaign, Content, Tasks, etc.)
✅ Auto-calculation triggers (profit, margin, ROAS)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git branch -M main
git remote add origin https://github.com/Href01/parashop-ops.git
git push -u origin main
```

---

## 📋 STEP 5: Deploy to Vercel (5 minutes)

### 5A. Create Vercel Project

1. Go to: https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Import: `Href01/parashop-ops`
4. **Framework Preset:** Next.js (auto-detected)
5. **Root Directory:** `./`
6. **Build Command:** `npm run build`
7. **Install Command:** `npm install`

### 5B. Add Environment Variables

Click **Environment Variables** and add:

```bash
DATABASE_URL
postgresql://neondb_owner:npg_BrRNZc7QAD0j@ep-withered-tree-abeitjt9-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require

NEXTAUTH_SECRET
# Generate with: openssl rand -base64 32
# Or paste any random 32+ character string

NEXTAUTH_URL
https://ops.shinecosmetics.ma

SENDIT_API_BASE_URL
https://api.sendit.ma

SENDIT_PUBLIC_KEY
e6ef89a1a8a2c9f8cf95cc6cf10e3e3b

SENDIT_PRIVATE_KEY
gNKoj1BQIdFF9YxvNUytq1UQ0TZtyluX
```

### 5C. Deploy

Click **Deploy**

**Wait:** 2-3 minutes for build

**Expected:**
- Build succeeds
- Deployment URL: `https://parashop-ops-xxxxx.vercel.app`

---

## 📋 STEP 6: Add Custom Domain (5 minutes)

### 6A. In Vercel

1. Go to your project → **Settings** → **Domains**
2. Add domain: `ops.shinecosmetics.ma`
3. Vercel will show DNS records to add

### 6B. In Your DNS Provider

**Where you bought shinecosmetics.ma** (e.g., Namecheap, GoDaddy, etc.):

1. Find **DNS Settings** / **DNS Management**
2. Add new record:
   ```
   Type: CNAME
   Name: ops
   Value: cname.vercel-dns.com
   TTL: Automatic or 3600
   ```
3. **Save**

### 6C. Wait for DNS

- Takes 5-60 minutes
- Vercel will auto-issue SSL certificate when DNS propagates
- Check: https://ops.shinecosmetics.ma

---

## 📋 STEP 7: Test Production (2 minutes)

1. Go to: https://ops.shinecosmetics.ma
2. Try logging in with:
   - Email: `mekouar01@gmail.com`
   - Password: (your current website password)
3. Should see dashboard

**If login fails:**
- Check if your email exists in `User` table in database
- Check if password matches
- Try logging in with same credentials on main website first

---

## ✅ Phase 1 Complete!

**What works now:**
- ✅ BOS accessible at ops.shinecosmetics.ma
- ✅ Founders-only access
- ✅ Database tables created
- ✅ Sendit integration ready

**Next: Phase 2 - Orders Module**

I'll build:
- Manual order creation (WhatsApp, Instagram, TikTok)
- Website order webhook
- Sendit shipment creation
- Order list & detail views

---

## 🔧 Troubleshooting

### "Database connection failed"
```bash
# Test connection:
psql "postgresql://neondb_owner:..."

# If fails, check:
# 1. DATABASE_URL is correct
# 2. Neon database is active
# 3. No IP restrictions
```

### "Authentication error"
```bash
# Verify your email in User table:
psql "postgresql://..." -c "SELECT email FROM \"User\" WHERE email = 'mekouar01@gmail.com';"

# If not found, create user via website first
```

### "Build fails on Vercel"
- Check Node version: 18.x or 20.x
- Check `package.json` dependencies
- Look at Vercel build logs

---

## 📞 Need Help?

Check deployment logs:
- Vercel: https://vercel.com/Href01/parashop-ops/deployments
- GitHub: https://github.com/Href01/parashop-ops/actions

---

**Ready for Phase 2?** Let me know and I'll start building the Orders module! 🚀
