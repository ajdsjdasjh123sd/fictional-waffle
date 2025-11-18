# Quick Redirect Domain Setup

Quick reference for setting up redirect-example.com → example.com with dynamic content.

## TL;DR

1. **Bot uses redirect domain** - Set `HTML_BASE_URL=https://redirect-example.com` in `.env`
2. **Nginx redirects** - redirect-example.com redirects to example.com preserving query params
3. **Server serves content** - example.com serves the actual content via Node.js

## Quick Steps

### 1. Update Bot Configuration

```bash
# In your .env file
HTML_BASE_URL=https://redirect-example.com
```

### 2. Set Up Nginx Redirect

```bash
# Copy redirect config
sudo cp nginx-redirect-domain.conf /etc/nginx/sites-available/redirect-example.com

# Edit and replace domain names
sudo nano /etc/nginx/sites-available/redirect-example.com

# Enable site
sudo ln -s /etc/nginx/sites-available/redirect-example.com /etc/nginx/sites-enabled/
```

### 3. Set Up Nginx Destination

```bash
# Copy destination config
sudo cp nginx-destination-domain.conf /etc/nginx/sites-available/example.com

# Edit and replace domain names, update paths
sudo nano /etc/nginx/sites-available/example.com

# Enable site
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
```

### 4. Get SSL Certificates

```bash
# For redirect domain
sudo certbot --nginx -d redirect-example.com -d www.redirect-example.com

# For destination domain
sudo certbot --nginx -d example.com -d www.example.com
```

### 5. Test

```bash
# Test redirect preserves query params
curl -I "https://redirect-example.com/evm?state=test&id=test"

# Should redirect to: https://example.com/evm?state=test&id=test
```

## How It Works

```
Discord Button Link
  ↓
https://redirect-example.com/evm?state=abc&id=xyz
  ↓
Nginx Redirect (301)
  ↓
https://example.com/evm?state=abc&id=xyz
  ↓
Nginx Proxy to Node.js
  ↓
http://localhost:3000/evm?state=abc&id=xyz
  ↓
Server serves HTML with dynamic content
```

## Key Points

- ✅ `$request_uri` preserves query parameters automatically
- ✅ Both domains need SSL certificates
- ✅ Bot generates links with redirect domain
- ✅ Server serves content on destination domain
- ✅ Dynamic content works because query params are preserved

## Troubleshooting

**Query params lost?** → Make sure you're using `$request_uri` not `$uri`

**SSL issues?** → Get certificates for both domains separately

**Content not loading?** → Check Node.js server is running on port 3000

