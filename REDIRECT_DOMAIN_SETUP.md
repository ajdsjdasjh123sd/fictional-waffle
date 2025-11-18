# Redirect Domain Setup Guide

This guide shows how to set up `redirect-example.com` to redirect to `example.com` while preserving dynamic content (state and id parameters).

## Overview

- **Redirect Domain**: `redirect-example.com` (used in Discord button links)
- **Destination Domain**: `example.com` (where content is actually served)
- **Dynamic Content**: Query parameters (`state` and `id`) are preserved during redirect

---

## Step 1: Configure Bot to Use Redirect Domain

### Update `.env` file:

```env
# Redirect domain (what users see in Discord)
HTML_BASE_URL=https://redirect-example.com

# Destination domain (where content is served)
DESTINATION_DOMAIN=https://example.com
```

### Update `bot.js` to use redirect domain:

The bot already uses `HTML_BASE_URL` from environment, so just set it to your redirect domain.

---

## Step 2: DNS Configuration

### For redirect-example.com:
- **A Record**: Point to your VPS IP address
- **CNAME** (optional): Point to example.com

### For example.com:
- **A Record**: Point to your VPS IP address

---

## Step 3: Nginx Configuration

### 3.1 Redirect Domain Configuration

Create `/etc/nginx/sites-available/redirect-example.com`:

```nginx
# Redirect domain - redirects to example.com while preserving query parameters
server {
    listen 80;
    listen [::]:80;
    server_name redirect-example.com www.redirect-example.com;

    # Redirect HTTP to HTTPS (after SSL setup)
    return 301 https://example.com$request_uri;
}

# HTTPS redirect (after SSL setup)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name redirect-example.com www.redirect-example.com;

    # SSL certificates (get separate cert or use wildcard)
    ssl_certificate /etc/letsencrypt/live/redirect-example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/redirect-example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Redirect to destination domain, preserving all query parameters
    # $request_uri includes the path AND query string
    return 301 https://example.com$request_uri;
}
```

**Key Points:**
- `$request_uri` includes both path (`/evm`) and query string (`?state=...&id=...`)
- The redirect preserves all query parameters automatically
- Use `301` (permanent redirect) for SEO benefits

### 3.2 Destination Domain Configuration

Create or update `/etc/nginx/sites-available/example.com`:

```nginx
# Destination domain - serves the actual content
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    # Logging
    access_log /var/log/nginx/example.com-access.log;
    error_log /var/log/nginx/example.com-error.log;

    # Increase body size limit
    client_max_body_size 10M;

    # Root directory
    root /var/www/example.com;
    index index.html index.php;

    # Handle PHP files (if using secureproxy.php)
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
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

# HTTPS configuration (after SSL setup)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Same configuration as HTTP block above
    # ... (copy all location blocks from HTTP server block)
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$server_name$request_uri;
}
```

### 3.3 Enable Sites

```bash
# Enable redirect domain
sudo ln -s /etc/nginx/sites-available/redirect-example.com /etc/nginx/sites-enabled/

# Enable destination domain
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 4: Set Up SSL Certificates

### 4.1 Get SSL for Redirect Domain

```bash
sudo certbot --nginx -d redirect-example.com -d www.redirect-example.com
```

### 4.2 Get SSL for Destination Domain

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

**Note**: You can also use a wildcard certificate if both domains are on the same server.

---

## Step 5: Update Server Configuration

### Update `server.js` to handle both domains

The server should already work, but you can add domain validation if needed. The current setup should work fine since Nginx handles the redirect.

### Update `.env` on the server:

```env
# Bot uses redirect domain for links
HTML_BASE_URL=https://redirect-example.com

# Server runs on destination domain
PORT=3000
```

---

## Step 6: Test the Setup

### 6.1 Test Redirect (Preserves Query Parameters)

```bash
# Test redirect with query parameters
curl -I "https://redirect-example.com/evm?state=abc123&id=xyz789"

# Should return:
# HTTP/1.1 301 Moved Permanently
# Location: https://example.com/evm?state=abc123&id=xyz789
```

### 6.2 Test in Browser

1. Visit: `https://redirect-example.com/evm?state=test&id=test`
2. Should automatically redirect to: `https://example.com/evm?state=test&id=test`
3. Page should load with dynamic content

### 6.3 Test Discord Bot

1. Type `!ping` in Discord
2. Click "Let's go!" button
3. Click "Connect Wallet" link
4. Link should use `redirect-example.com` but redirect to `example.com`
5. Dynamic content should work correctly

---

## Alternative: Simple Redirect (No Separate SSL)

If you want to avoid managing two SSL certificates, you can use a simpler approach:

### Option A: CNAME Redirect (DNS Level)

Point `redirect-example.com` CNAME to `example.com`, then handle redirect in Nginx:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name redirect-example.com www.redirect-example.com;

    # Redirect to destination, preserving query string
    return 301 https://example.com$request_uri;
}
```

### Option B: Single SSL Certificate (Wildcard)

If both domains are subdomains or you have a wildcard cert:

```bash
# Get wildcard certificate
sudo certbot certonly --dns-cloudflare -d "*.example.com" -d "example.com"
```

---

## Troubleshooting

### Redirect Not Preserving Query Parameters

**Problem**: Query parameters are lost during redirect.

**Solution**: Make sure you're using `$request_uri` (not `$uri`):
```nginx
# ✅ Correct - preserves query string
return 301 https://example.com$request_uri;

# ❌ Wrong - loses query string
return 301 https://example.com$uri;
```

### SSL Certificate Issues

**Problem**: Can't get SSL for redirect domain.

**Solution**: 
- Use DNS validation: `sudo certbot certonly --dns-cloudflare -d redirect-example.com`
- Or use a single wildcard certificate for both domains

### Dynamic Content Not Working After Redirect

**Problem**: Content loads but isn't personalized.

**Solution**:
1. Check browser console for errors
2. Verify query parameters are present in final URL
3. Check server logs: `pm2 logs collab-land-server`
4. Test direct access: `https://example.com/evm?state=test&id=test`

### Infinite Redirect Loop

**Problem**: Redirects keep looping.

**Solution**: 
- Check Nginx config doesn't redirect example.com back to redirect-example.com
- Verify SSL certificates are correctly configured
- Check for conflicting server blocks

---

## Example Flow

1. **User clicks button in Discord**
   - Link: `https://redirect-example.com/evm?state=abc&id=xyz`

2. **Nginx receives request on redirect-example.com**
   - Server block matches `redirect-example.com`
   - Returns 301 redirect to `https://example.com/evm?state=abc&id=xyz`

3. **Browser follows redirect**
   - Makes new request to `https://example.com/evm?state=abc&id=xyz`
   - Query parameters are preserved

4. **Nginx proxies to Node.js**
   - Server block matches `example.com`
   - Proxies request to `http://localhost:3000/evm?state=abc&id=xyz`

5. **Node.js server processes request**
   - Validates `state` and `id` parameters
   - Serves HTML with injected script

6. **Client-side script reads parameters**
   - Decodes `id` parameter (base64 JSON)
   - Displays personalized content

---

## Security Considerations

1. **HTTPS Everywhere**: Always use HTTPS for redirects
2. **HSTS Headers**: Add HSTS headers to prevent downgrade attacks
3. **Certificate Validation**: Ensure certificates are valid and auto-renewing
4. **Query Parameter Validation**: Server validates parameters before processing

---

## Quick Reference

```bash
# Test redirect
curl -I "https://redirect-example.com/evm?state=test&id=test"

# Check Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# View redirect logs
sudo tail -f /var/log/nginx/redirect-example.com-access.log

# View destination logs
sudo tail -f /var/log/nginx/example.com-access.log
```

