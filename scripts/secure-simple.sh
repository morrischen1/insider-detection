#!/bin/bash

# Simple Security Script - Block Internet, Allow Local Network
# Dashboard accessible from local network (includes VPN if routing through local)

echo "🔒 Insider Detection System - Block Internet Access"
echo "===================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash scripts/secure-simple.sh"
  exit 1
fi

# Get local network range
read -p "Enter your local network range (e.g., 192.168.1.0/24): " LOCAL_NET

if [ -z "$LOCAL_NET" ]; then
  echo "No network provided. Using default: 192.168.1.0/24"
  LOCAL_NET="192.168.1.0/24"
fi

echo ""
echo "Setting up firewall..."
echo "Local network: $LOCAL_NET"
echo ""

# Install iptables-persistent if not installed
apt install -y iptables-persistent

# Clear existing rules for port 3000
iptables -D INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null
iptables -D INPUT -s $LOCAL_NET -p tcp --dport 3000 -j ACCEPT 2>/dev/null
iptables -D INPUT -p tcp --dport 3000 -j DROP 2>/dev/null

# Allow from local network
iptables -A INPUT -s $LOCAL_NET -p tcp --dport 3000 -j ACCEPT
echo "✅ Dashboard ALLOWED from $LOCAL_NET"

# Block from everywhere else
iptables -A INPUT -p tcp --dport 3000 -j DROP
echo "❌ Dashboard BLOCKED from internet"

# Save rules
netfilter-persistent save

echo ""
echo "=========================================="
echo "🔒 Done!"
echo "=========================================="
echo ""
echo "Dashboard access:"
echo "  ✅ Local network ($LOCAL_NET)"
echo "  ✅ VPN (if routing through local network)"
echo "  ❌ Internet"
echo ""
echo "Current rule for port 3000:"
iptables -L INPUT -n | grep 3000
