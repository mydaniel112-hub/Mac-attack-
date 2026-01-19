# How to Deploy Your Golf App to iPhone

## Option 1: Deploy to Vercel (Easiest - Recommended) ✅

### Step 1: Push to GitHub
1. Create a new repository on GitHub (if you haven't already)
2. In your terminal, run:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### Step 2: Deploy to Vercel
1. Go to https://vercel.com
2. Sign up/login with your GitHub account
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will auto-detect it's a Vite app
6. Click "Deploy"
7. Wait 1-2 minutes
8. Get your live URL (like `your-app.vercel.app`)
9. Open that URL on your iPhone! 📱

## Option 2: Deploy to Netlify (Also Free)

1. Push to GitHub (same as above)
2. Go to https://netlify.com
3. Sign up/login
4. Click "Add new site" → "Import an existing project"
5. Connect GitHub and select your repo
6. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
7. Click "Deploy"
8. Get your live URL and open on iPhone

## Option 3: Build Locally and Deploy

In your terminal:
```bash
npm run build
```

This creates a `dist` folder you can upload to any hosting service.

## Quick Commands:

```bash
# Build the app
npm run build

# Preview the build locally
npm run preview
```

## Important Notes:

- ✅ Both services are FREE
- ✅ Automatic HTTPS (needed for camera/GPS on iPhone)
- ✅ Works on iPhone immediately
- ✅ Updates automatically when you push to GitHub
