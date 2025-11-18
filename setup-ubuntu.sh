#!/bin/bash

# Ubuntu VPS Setup Script for Collab.Land Discord Bot
# Run with: bash setup-ubuntu.sh

set -e

echo "🚀 Starting Ubuntu VPS Setup for Collab.Land Discord Bot"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Please do not run as root. Run as a regular user with sudo privileges.${NC}"
   exit 1
fi

# Check Ubuntu version
if [ ! -f /etc/os-release ]; then
    echo -e "${RED}This script is designed for Ubuntu.${NC}"
    exit 1
fi

. /etc/os-release
if [ "$ID" != "ubuntu" ]; then
    echo -e "${YELLOW}Warning: This script is designed for Ubuntu. Proceeding anyway...${NC}"
fi

echo "📦 Step 1: Updating system packages..."
sudo apt update
sudo apt upgrade -y

echo ""
echo "📦 Step 2: Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo -e "${GREEN}Node.js is already installed: $(node --version)${NC}"
fi

echo ""
echo "📦 Step 3: Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
else
    echo -e "${GREEN}Nginx is already installed${NC}"
fi

echo ""
echo "📦 Step 4: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    echo -e "${GREEN}PM2 is already installed${NC}"
fi

echo ""
echo "📦 Step 5: Installing PHP (for secureproxy.php)..."
if ! command -v php &> /dev/null; then
    sudo apt install -y php-fpm php-cli
else
    echo -e "${GREEN}PHP is already installed${NC}"
fi

echo ""
echo "📦 Step 6: Installing Certbot (for SSL)..."
if ! command -v certbot &> /dev/null; then
    sudo apt install -y certbot python3-certbot-nginx
else
    echo -e "${GREEN}Certbot is already installed${NC}"
fi

echo ""
echo "📦 Step 7: Configuring Firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow OpenSSH
    sudo ufw allow 'Nginx Full'
    echo "y" | sudo ufw enable
    echo -e "${GREEN}Firewall configured${NC}"
else
    echo -e "${YELLOW}UFW not found, skipping firewall setup${NC}"
fi

echo ""
echo -e "${GREEN}✅ Basic setup complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "1. Upload your bot files to the server"
echo "2. Run: npm install"
echo "3. Create .env file with your DISCORD_TOKEN and HTML_BASE_URL"
echo "4. Configure Nginx (see UBUNTU_NGINX_SETUP.md)"
echo "5. Set up SSL with: sudo certbot --nginx -d yourdomain.com"
echo "6. Start services with PM2:"
echo "   pm2 start server.js --name collab-land-server"
echo "   pm2 start bot.js --name collab-land-bot"
echo "   pm2 save"
echo ""
echo "📖 See UBUNTU_NGINX_SETUP.md for detailed instructions"

