# Simple Setup Guide

## Step 1: Install Node.js

**Download and Install:**
1. Go to https://nodejs.org/
2. Download the LTS version (v18 or higher)
3. Run the installer
4. Make sure to check "Add to PATH" during installation

**Verify installation:**
```bash
node --version
npm --version
```

You should see version numbers like `v18.17.0` and `9.6.7`.

---

## Step 2: Get Discord Bot Token

1. Go to https://discord.com/developers/applications
2. Create a new application (or use existing)
3. Go to "Bot" section
4. Click "Reset Token" or "Copy" to get your token
5. Enable "Message Content Intent" in Privileged Gateway Intents
6. Save your token (you'll need it in Step 4)

---

## Step 3: Deploy Website to Deno Deploy

### 3.1. Push Code to GitHub

```bash
# If not already done:
git add .
git commit -m "Initial commit"
git push -u origin main
```

### 3.2. Deploy to Deno Deploy

1. Go to https://deno.com/deploy
2. Sign in with GitHub
3. Click "New Project"
4. Select "GitHub" → Select repository: `urban-barnacle` (or your repo name)
5. **Entrypoint:** Enter `deploy.ts` (this is the file that serves your HTML)
6. Click "Deploy"
7. Copy your URL (e.g., `https://urban-barnacle-xxxx.deno.dev`)

**Important:** The entrypoint is `deploy.ts` - this file serves your HTML file to users.

### 3.3. Add Custom Domain (Optional)

1. In Deno Deploy dashboard → "Settings" → "Domains"
2. Click "Add Domain"
3. Enter your domain
4. Add DNS records as instructed
5. Click "Validate" and "Provision Certificate"

---

## Step 4: Run Bot on Your PC

### Option A: Use Startup Script (Easiest)

**Windows:**
- Double-click `start_bot.bat` (or right-click `start_bot.ps1` → "Run with PowerShell")
- Enter your Discord token when prompted
- Enter your Deno Deploy URL when prompted (or press Enter to skip)
- Bot will start!

### Option B: Manual Setup

**Windows (PowerShell):**
```powershell
# Install dependencies (first time only)
npm install

# Set your Discord token
$env:DISCORD_TOKEN="your_discord_bot_token_here"

# Set your website URL (from Deno Deploy)
$env:HTML_BASE_URL="https://your-project-xxxx.deno.dev"

# Run bot
npm start
```

**Windows (Command Prompt):**
```cmd
REM Install dependencies (first time only)
npm install

REM Set your Discord token
set DISCORD_TOKEN=your_discord_bot_token_here

REM Set your website URL (from Deno Deploy)
set HTML_BASE_URL=https://your-project-xxxx.deno.dev

REM Run bot
npm start
```

**Linux/Mac:**
```bash
# Install dependencies (first time only)
npm install

# Set your Discord token
export DISCORD_TOKEN="your_discord_bot_token_here"

# Set your website URL (from Deno Deploy)
export HTML_BASE_URL="https://your-project-xxxx.deno.dev"

# Run bot
npm start
```

---

## Step 5: Invite Bot to Discord Server

1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to "OAuth2" → "URL Generator"
4. Select scopes: `bot`
5. Select permissions: `Send Messages`, `Use Slash Commands`
6. Copy the generated URL
7. Open URL in browser and invite bot to your server

---

## Step 6: Test

1. **In Discord:**
   - Type `!ping` in a channel
   - You should see an embed with "Let's go!" button

2. **Click "Let's go!" button:**
   - Bot should send you a personalized link
   - Click the link

3. **Verify Website:**
   - Link should open your Deno Deploy website
   - Should show personalized content (your avatar, server icon, etc.)

---

## Troubleshooting

### Bot not responding?
- ✅ Check bot is running (terminal should show "Bot is ready")
- ✅ Check bot has "Message Content Intent" enabled
- ✅ Check bot has permission to send messages
- ✅ Check Node.js version: `node --version` (should be v18 or higher)

### Website not loading?
- ✅ Check Deno Deploy deployment is successful
- ✅ Check URL in browser address bar
- ✅ Check browser console for errors

### URL parameters not working?
- ✅ Make sure `HTML_BASE_URL` is set correctly
- ✅ Check URL has parameters: `?state=...&id=...`
- ✅ Verify HTML file has JavaScript to read parameters

### npm install fails?
- ✅ Make sure Node.js is installed: `node --version`
- ✅ Try deleting `node_modules` folder and `package-lock.json`, then run `npm install` again
- ✅ Check your internet connection

---

## Quick Commands

```bash
# Install dependencies (first time)
npm install

# Start bot
npm start

# Check bot status
# Look for: "✅ BotName#1234 is ready and connected!"

# Stop bot
# Press Ctrl+C in terminal
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ Yes | Your Discord bot token |
| `HTML_BASE_URL` | ⚠️ Optional | Your Deno Deploy URL (defaults to local file) |

---

## Next Steps

1. ✅ Bot is running on your PC
2. ✅ Website is deployed to Deno Deploy
3. ✅ Test the full flow
4. ✅ Add custom domain (optional)
5. ✅ Keep bot running (or deploy to Railway/Render for 24/7)

---

## Need Help?

- Check `README.md` for more details
- Check bot logs in terminal
- Check Deno Deploy logs in dashboard
- Verify environment variables are set correctly
- Make sure Node.js version is v18 or higher
