# Ubuntu VPS Setup Guide with Nginx

Complete guide to deploy the Collab.Land Discord Bot on an Ubuntu VPS with Nginx reverse proxy and SSL.

## Prerequisites

- Ubuntu 20.04 or 22.04 LTS VPS
- Root or sudo access
- Domain name pointed to your VPS IP (A record)
- Discord Bot Token

---

## Step 1: Initial Server Setup

### 1.1 Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2 Create Non-Root User (if needed)

```bash
# Create user
sudo adduser deploy
sudo usermod -aG sudo deploy

# Switch to new user
su - deploy
```

---

## Step 2: Install Required Software

### 2.1 Install Node.js (v18+)

```bash
# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 2.2 Install Nginx

```bash
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

### 2.3 Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Verify installation
pm2 --version
```

### 2.4 Install PHP (if using secureproxy.php)

```bash
sudo apt install -y php-fpm php-cli

# Check PHP version
php --version
```

---

## Step 3: Deploy Application

### 3.1 Create Project Directory

```bash
# Create directory
sudo mkdir -p /var/www/yourdomain.com
sudo chown -R $USER:$USER /var/www/yourdomain.com

# Or use your home directory
mkdir -p ~/bot
cd ~/bot
```

### 3.2 Upload Files

**Option A: Using Git (Recommended)**

```bash
cd /var/www/yourdomain.com  # or ~/bot

# Clone your repository
git clone https://github.com/yourusername/your-repo.git .

# Or if you have files locally, use SCP:
# scp -r /local/path/* user@your-server:/var/www/yourdomain.com/
```

**Option B: Using SCP from Local Machine**

```bash
# From your local machine
scp -r * user@your-server-ip:/var/www/yourdomain.com/
```

### 3.3 Install Dependencies

```bash
cd /var/www/yourdomain.com  # or ~/bot
npm install
```

---

## Step 4: Configure Environment Variables

### 4.1 Create .env File

```bash
cd /var/www/yourdomain.com  # or ~/bot
nano .env
```

Add the following (replace with your values):

```env
# Discord Bot Token
DISCORD_TOKEN=your_discord_bot_token_here

# Your domain URL (use https:// once SSL is set up)
HTML_BASE_URL=https://yourdomain.com

# Server port (default: 3000)
PORT=3000
```

Save and exit (Ctrl+X, then Y, then Enter).

### 4.2 Secure .env File

```bash
chmod 600 .env
```

---

## Step 5: Configure Nginx

### 5.1 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/yourdomain.com
```

Paste the following configuration (replace `yourdomain.com` with your actual domain):

```nginx
# HTTP server (will redirect to HTTPS after SSL setup)
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Logging
    access_log /var/log/nginx/yourdomain.com-access.log;
    error_log /var/log/nginx/yourdomain.com-error.log;

    # Increase body size limit
    client_max_body_size 10M;

    # Root directory
    root /var/www/yourdomain.com;
    index index.html index.php;

    # Handle PHP files (if using secureproxy.php)
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;  # Adjust PHP version
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # Proxy all requests to Node.js server
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # Headers for proper proxying
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Disable buffering
        proxy_buffering off;
    }
}
```

Save and exit.

### 5.2 Enable Site

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

---

## Step 6: Set Up SSL with Let's Encrypt

### 6.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 6.2 Obtain SSL Certificate

```bash
# Replace yourdomain.com with your actual domain
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts:
- Enter your email address
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

### 6.3 Verify SSL Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up renewal, but verify:
sudo systemctl status certbot.timer
```

---

## Step 7: Configure Firewall

### 7.1 Set Up UFW (Uncomplicated Firewall)

```bash
# Allow SSH (important - don't lock yourself out!)
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Step 8: Start Application with PM2

### 8.1 Start Node.js Server

```bash
cd /var/www/yourdomain.com  # or ~/bot

# Start server
pm2 start server.js --name collab-land-server

# Start Discord bot
pm2 start bot.js --name collab-land-bot
```

### 8.2 Configure PM2 to Start on Boot

```bash
# Generate startup script
pm2 startup

# Follow the command it outputs (usually something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy

# Save current PM2 process list
pm2 save
```

### 8.3 Useful PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs
pm2 logs collab-land-server
pm2 logs collab-land-bot

# Restart services
pm2 restart collab-land-server
pm2 restart collab-land-bot

# Stop services
pm2 stop collab-land-server
pm2 stop collab-land-bot

# Monitor resources
pm2 monit
```

---

## Step 9: Verify Everything Works

### 9.1 Check Services

```bash
# Check PM2
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check Node.js server is responding
curl http://localhost:3000/health
```

### 9.2 Test in Browser

1. Visit `http://yourdomain.com` - should redirect to HTTPS
2. Visit `https://yourdomain.com/evm?state=test&id=test` - should load the page
3. Check browser console for any errors

### 9.3 Test Discord Bot

1. In Discord, type `!ping` in a channel where the bot has access
2. Click "Let's go!" button
3. Click "Connect Wallet" link
4. Verify the link opens and shows personalized content

---

## Step 10: Update Nginx for HTTPS (After SSL)

After SSL is set up, Certbot automatically updates your Nginx config. Your final config should look like:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ... rest of your configuration ...
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Troubleshooting

### Bot Not Starting

```bash
# Check PM2 logs
pm2 logs collab-land-bot

# Check if .env file exists and has correct values
cat .env

# Verify Discord token is valid
# Check bot has "Message Content Intent" enabled in Discord Developer Portal
```

### Server Not Responding

```bash
# Check if Node.js server is running
pm2 status

# Check server logs
pm2 logs collab-land-server

# Test if server responds locally
curl http://localhost:3000/health

# Check Nginx error logs
sudo tail -f /var/log/nginx/yourdomain.com-error.log
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Check Nginx config
sudo nginx -t
```

### Port Already in Use

```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill the process or change PORT in .env
```

### Permission Issues

```bash
# Fix file permissions
sudo chown -R $USER:$USER /var/www/yourdomain.com
chmod 600 .env
```

---

## Maintenance

### Update Application

```bash
cd /var/www/yourdomain.com  # or ~/bot

# Pull latest changes (if using Git)
git pull

# Install new dependencies
npm install

# Restart services
pm2 restart all
```

### View Logs

```bash
# All PM2 logs
pm2 logs

# Specific service
pm2 logs collab-land-server

# Nginx logs
sudo tail -f /var/log/nginx/yourdomain.com-access.log
sudo tail -f /var/log/nginx/yourdomain.com-error.log
```

### Backup

```bash
# Backup .env file
cp .env .env.backup

# Backup entire directory
tar -czf bot-backup-$(date +%Y%m%d).tar.gz /var/www/yourdomain.com
```

---

## Security Checklist

- [ ] Firewall (UFW) is enabled
- [ ] SSH key authentication (disable password auth)
- [ ] `.env` file has correct permissions (600)
- [ ] SSL certificate is installed and auto-renewing
- [ ] Nginx is configured to only allow necessary methods
- [ ] Regular system updates (`sudo apt update && sudo apt upgrade`)
- [ ] PM2 is configured to restart on failure
- [ ] Logs are being monitored

---

## Quick Reference

```bash
# Start services
pm2 start all

# Stop services
pm2 stop all

# Restart services
pm2 restart all

# View status
pm2 status

# View logs
pm2 logs

# Reload Nginx
sudo systemctl reload nginx

# Test Nginx config
sudo nginx -t

# Check SSL certificate
sudo certbot certificates
```

---

## Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/yourdomain.com-error.log`
3. Verify environment variables: `cat .env`
4. Test server locally: `curl http://localhost:3000/health`
5. Check firewall: `sudo ufw status`

---

## Next Steps

1. ✅ Set up monitoring (optional: use PM2 Plus or external monitoring)
2. ✅ Set up automated backups
3. ✅ Configure log rotation
4. ✅ Set up domain email (optional)
5. ✅ Add additional security headers in Nginx

