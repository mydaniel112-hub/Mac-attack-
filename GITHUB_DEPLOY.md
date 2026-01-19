# Deploy Using GitHub Token

## Step 1: Get Your GitHub Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a name: `golf-app-deploy`
4. Select these permissions:
   - ✅ `repo` (full control of private repositories)
5. Click **"Generate token"** at the bottom
6. **COPY THE TOKEN** - you'll only see it once! It looks like: `ghp_xxxxxxxxxxxxxxxxxxxx`

## Step 2: Create GitHub Repository

1. Go to: https://github.com/new
2. Repository name: `golf-mac-app` (or any name you want)
3. Choose **Public** or **Private**
4. **DO NOT** check "Initialize with README"
5. Click **"Create repository"**

## Step 3: Copy Your Repository URL

After creating, you'll see a page with setup instructions. Look for the URL, it will be:
- `https://github.com/YOUR_USERNAME/golf-mac-app.git`

**Remember YOUR_USERNAME** (it's in the URL)

## Step 4: Push to GitHub Using Token

Run these commands in your terminal (replace the placeholders):

```bash
cd "/Users/danielmacwilliams/golf macazine"
git init
git add .
git commit -m "Golf Mac app - ready for deployment"
git branch -M main
git remote add origin https://YOUR_TOKEN@github.com/YOUR_USERNAME/golf-mac-app.git
git push -u origin main
```

**Replace:**
- `YOUR_TOKEN` with your token from Step 1 (the `ghp_xxxxx` one)
- `YOUR_USERNAME` with your GitHub username
- `golf-mac-app` with your repo name if different

**Example:**
```bash
git remote add origin https://ghp_abc123xyz789@github.com/danielmacwilliams/golf-mac-app.git
```

## Step 5: Deploy to Vercel

1. Go to: https://vercel.com
2. Sign up/Login (use GitHub to sign in)
3. Click **"Add New Project"**
4. Click **"Import"** next to your repository
5. Click **"Deploy"**
6. Wait 1-2 minutes
7. You'll get a URL like: `golf-mac-app.vercel.app`
8. Open that URL on your iPhone! 📱

---

## Quick Reference:

**Your commands will look like this:**
```bash
cd "/Users/danielmacwilliams/golf macazine"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://ghp_YOUR_TOKEN_HERE@github.com/YOUR_USERNAME/golf-mac-app.git
git push -u origin main
```

That's it! Once pushed to GitHub, deploy on Vercel takes 1 click! 🚀
