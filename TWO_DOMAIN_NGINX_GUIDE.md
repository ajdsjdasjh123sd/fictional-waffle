# Two-Domain Nginx Deployment (Ubuntu + Cloudflare)

End-to-end guide for running the redirect + destination domain workflow on a single Ubuntu VPS when Cloudflare terminates SSL.

---

## 1. DNS & Cloudflare

- Add `A` records for both domains pointing to your VPS IP.
- Turn **orange cloud ON** (proxied) for `redirect.example.com` and `example.com`.
- Cloudflare SSL/TLS mode: **Full** (or **Full (strict)** if you later install an origin cert).  
  Do **not** use “Flexible”.

No Certbot or local SSL certificates are required because Cloudflare handles HTTPS.

---

## 2. Install Server Software

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20.x (required for server.js + bot.js)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx reverse proxy
sudo apt install -y nginx

# Optional: PHP-FPM (only if you use secureproxy.php)
sudo apt install -y php-fpm

# PM2 process manager
sudo npm install -g pm2
```

---

## 3. Deploy the Project

```bash
sudo mkdir -p /var/www/example.com
sudo chown -R $USER:$USER /var/www/example.com
cd /var/www/example.com

# copy or git clone the project here
npm install
```

Create `.env` (the redirect domain goes in `HTML_BASE_URL`):

```env
DISCORD_TOKEN=your_discord_bot_token
HTML_BASE_URL=https://redirect.example.com
PORT=3000
SLUG_SERVICE_BASE_URL=https://example.com   # if you use slugs
ENABLE_SLUG_SERVICE=true
```

Lock it down:

```bash
chmod 600 .env
```

---

## 4. Run Node Server & Bot with PM2

```bash
cd /var/www/example.com
pm2 start server.js --name collab-land-server
pm2 start bot.js --name collab-land-bot
pm2 save
pm2 startup
```

Check status/logs:

```bash
pm2 status
pm2 logs collab-land-server
pm2 logs collab-land-bot
```

---

## 5. Nginx – Destination Domain (`example.com`)

File: `/etc/nginx/sites-available/example.com`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html index.php;

    # Optional PHP support
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;  # adjust version
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # Proxy everything (slugs, /evm, etc.) to Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
}
```

Enable + reload:

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Nginx – Redirect Domain (`redirect.example.com`)

File: `/etc/nginx/sites-available/redirect.example.com`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name redirect.example.com www.redirect.example.com;

    # Preserve slug or /evm path plus query string
    return 301 https://example.com$request_uri;
}
```

Enable + reload:

```bash
sudo ln -s /etc/nginx/sites-available/redirect.example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Because Cloudflare handles HTTPS, Nginx only listens on port 80. Users still see HTTPS thanks to Cloudflare.

---

## 7. Flow (Slug-Friendly)

1. Bot sends `https://redirect.example.com/abc123`
2. Cloudflare terminates TLS → Nginx redirect server issues `301 https://example.com/abc123`
3. Destination domain proxies `/abc123` → `http://localhost:3000/abc123`
4. `server.js` looks up slug `abc123`, finds the stored `state`/`id`, and serves dynamic HTML.

---

## 8. Troubleshooting Checklist

- **DNS**: Both domains point to VPS, proxied in Cloudflare.
- **Cloudflare SSL mode**: Must be **Full**.
- **.env**: `HTML_BASE_URL` uses the redirect domain; port = 3000; slug settings set.
- **PM2**: `server.js` + `bot.js` running (`pm2 status`).
- **Nginx configs**:  
  - Destination domain proxies `/` → `localhost:3000`.  
  - Redirect domain uses `return 301 https://example.com$request_uri;`.  
  - `sudo nginx -t` passes; Nginx reloaded.

If you later need direct HTTPS between Cloudflare and your VPS, install a Cloudflare Origin Certificate and switch SSL mode to **Full (strict)**, but the redirect/destination logic remains identical.

