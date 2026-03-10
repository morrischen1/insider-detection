# Insider Trade Detection System

A comprehensive system for detecting potential insider trades on Polymarket and Kalshi prediction markets. This tool continuously monitors markets, evaluates trades based on configurable criteria, and provides real-time alerts when suspicious activity is detected.

## Features

### Core Functionality
- **Continuous Monitoring**: Real-time scanning of trades across Polymarket and Kalshi
- **Insider Detection Algorithm**: Multi-criteria evaluation system for identifying suspicious trades
- **Probability Scoring**: Weighted scoring system to calculate insider trading probability
- **Watchlist Management**: Track flagged accounts and monitor their activity
- **Auto-Trading**: Optional automated trading when insider trades are detected
- **Multi-Platform Support**: Monitor both Polymarket and Kalshi simultaneously

### Detection Criteria
The system evaluates trades based on the following criteria:

| Criteria | Default Weight | Description |
|----------|--------|-------------|
| Account Age | 25 | New accounts (<30 days) with large trades |
| Trade Size | 25 | Large trades relative to thresholds |
| Timing Precision | 30 | Trades placed close to resolution events |
| Win Rate on Big Bets | 25 | Suspiciously high win rates on large trades |
| First Market Activity | 15 | Large trades as first activity on platform |
| Market Knowledge | 15 | High confidence bets on obscure markets |
| Price Movement | 15 | Trades that significantly move market prices |
| Behavioral Pattern | 25 | Similar patterns across multiple accounts (sybil detection) |
| Liquidity Targeting | 15 | Betting when market liquidity is low |
| Previous Watchlist | 35 | Accounts previously flagged for suspicious activity |

### Notification Channels
- **Telegram**: Bot notifications with formatted messages
- **Discord**: Webhook integration with rich embeds
- **Slack**: Webhook integration with block formatting
- **Custom Webhook**: Generic webhook for custom integrations

### Web Dashboard
- Real-time monitoring status
- Recent detections feed
- Watchlist management
- Configuration controls
- Log viewer with export

## Installation

### Prerequisites
- Node.js 18+
- npm
- SQLite3
- (Optional) Polymarket CLOB API credentials for auto-trading
- (Optional) Kalshi API credentials for auto-trading

### Raspberry Pi Setup

1. **Clone and Install**
```bash
cd /home/pi
git clone <repository-url> insider-detection
cd insider-detection
npm install
```

2. **Configure Environment**
```bash
cp ex.example .env
nano .env
```

3. **Initialize Database**
```bash
npm run db:init
```

4. **Start the Application**
```bash
npm run dev
```

5. **Access Dashboard**
Open a browser on your local network and navigate to:
```
http://<raspberry-pi-ip>:3000
```

### Production Deployment

1. **Build the Application**
```bash
npm run build
```

2. **Run with PM2 (recommended for 24/7 operation)**
```bash
npm install -g pm2
pm2 start npm --name "insider-detection" -- run start
pm2 save
pm2 startup
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | Yes |
| `AUTH_ENABLED` | Enable password protection | Recommended |
| `ADMIN_PASSWORD` | Dashboard login password | If auth enabled |
| `POLYMARKET_API_KEY` | Polymarket CLOB API key | For auto-trading |
| `POLYMARKET_API_SECRET` | Polymarket CLOB API secret | For auto-trading |
| `POLYMARKET_ADDRESS` | Polymarket wallet address | For auto-trading |
| `KALSHI_API_KEY` | Kalshi API key | For auto-trading |
| `KALSHI_API_SECRET` | Kalshi API secret | For auto-trading |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | For Telegram notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat ID | For Telegram notifications |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | For Discord notifications |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | For Slack notifications |

### Platform Settings (Configurable via Dashboard)

- **Min Market Liquidity**: Minimum liquidity threshold for monitoring (default: $10,000)
- **Big Trade Threshold (USD)**: USD threshold for flagging large trades (default: $1,000)
- **Big Trade Threshold (%)**: Percentage of market liquidity for flagging (default: 2%)
- **Polling Interval**: Seconds between scan cycles (default: 10)

### Global Settings (Configurable via Dashboard)

- **Auto-Trade Enabled**: Enable/disable automatic trading (default: disabled)
- **Auto-Trade Amount**: USD amount to bet on detected insider trades (default: $1)
- **Probability Threshold**: Minimum probability to trigger auto-trade (default: 70%)
- **Data Retention**: Days to keep historical logs (default: 365)

## Security

### ⚠️ Important Security Notice

**Without configuration, the system is NOT secure for network exposure!**

By default:
- No authentication is enabled
- Anyone on your network can access the dashboard
- Anyone can enable auto-trading with real money

### Enable Authentication

1. **Set a password in `.env`:**
```bash
# Enable authentication (default: true)
AUTH_ENABLED=true

# Set your password (CHANGE THIS!)
ADMIN_PASSWORD=your-secure-password-here

# Or use a bcrypt hash for better security:
# ADMIN_PASSWORD_HASH=$2a$10$...
```

2. **Generate a password hash (recommended):**
```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10).then(console.log)"
```

### Security Checklist

| Risk | Mitigation |
|------|------------|
| Dashboard access | Set `ADMIN_PASSWORD` in `.env` |
| API exposure | Authentication protects all `/api/*` routes |
| Auto-trade misuse | Requires explicit enable + probability threshold |
| Credential exposure | API keys stored server-side only (`.env`) |
| Session hijacking | HTTP-only cookies, 24-hour expiry |

### Network Security (Recommended)

The dashboard should only be accessible from your local network, not the internet.

### Quick Security Setup

Run this script to block internet access:

```bash
sudo chmod +x scripts/secure-simple.sh
sudo bash scripts/secure-simple.sh
```

This will:
- ✅ Allow dashboard from local network (192.168.x.x)
- ❌ Block dashboard from internet

### VPN for Remote Access (Optional)

If you want to access the dashboard remotely, run a VPN on your Pi that routes to your local network:

**Tailscale (easiest):**
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect and advertise local network routes
sudo tailscale up --advertise-routes=192.168.1.0/24
```

Once connected via VPN, you'll be on the local network and can access the dashboard normally.

**WireGuard:**
```bash
sudo apt install wireguard

# Create /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <your-private-key>
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = <client-public-key>
AllowedIPs = 10.0.0.2/32, 192.168.1.0/24
```

### Summary

| Access Method | Allowed |
|---------------|---------|
| Local network | ✅ Yes |
| Via VPN (local routing) | ✅ Yes |
| Direct internet | ❌ No |

## Troubleshooting

### Common Issues

**Detection engine not starting**
- Check that database is initialized (`npm run db:init`)
- Verify network connectivity to APIs
- Check logs for specific errors

**No trades being detected**
- Verify minimum liquidity threshold is appropriate
- Check if detection is enabled for the platform
- Ensure polling interval is reasonable

**Notifications not working**
- Verify credentials in environment variables
- Test notification from dashboard
- Check notification logs

**Auto-trade failing**
- Verify CLOB API credentials
- Check account balance
- Review API error logs

### Performance Optimization

- Increase polling interval for lower API load
- Raise minimum liquidity threshold to reduce scope
- Disable unused platforms
- Use data retention to limit database size

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Dashboard UI
│   ├── layout.tsx        # Root layout
│   └── api/              # API routes
│       ├── detection/    # Detection control
│       ├── trades/       # Trade data
│       ├── watchlist/    # Watchlist management
│       ├── config/       # Configuration
│       ├── notifications/# Notification settings
│       ├── autotrade/    # Auto-trade control
│       ├── logs/         # Log access
│       └── stats/        # Statistics
├── lib/
│   ├── db.ts             # Database client (better-sqlite3)
│   ├── auth.ts           # Authentication
│   ├── polymarket/       # Polymarket API clients
│   ├── kalshi/           # Kalshi API client
│   ├── detection/        # Detection engine
│   ├── notifications/    # Notification services
│   ├── autotrade/        # Auto-trade executor
│   └── logger/           # Logging utilities
├── components/ui/        # UI components
├── types/                # TypeScript types
└── scripts/
    ├── init-db.js        # Database initialization
    └── secure-simple.sh  # Network security script
```

## License

MIT License

##
**Built with [Z AI](https://z.ai)**
