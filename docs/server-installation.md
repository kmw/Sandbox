# Server Installation Guide

## Prerequisites
- Node.js v18.x or later
- Git
- NPM (included with Node.js)

## Basic Installation

1. Clone the repository:
```bash
git clone https://github.com/kmw/Sandbox.git
cd Sandbox
git checkout master
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node app.js
```

The server will be available at `http://localhost:3000`

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-a <username>` | Administrator username | `admin` |
| `-ap <url_prefix>` | URL prefix (must start with /) | `/adl/sandbox` |
| `-cc` | Enable cache control with version string | `false` |
| `-clean` | Delete previous build | - |
| `-config <file>` | Custom config file path | `config.json` |
| `-compile` | Build RequireJS module | `false` |
| `-d <directory>` | Data directory path | `./data` |
| `-DB <driver>` | Database driver selection | - |
| `-exit` | Exit after build | `false` |
| `-ls <ms>` | Simulate latency (milliseconds) | `0` |
| `-min` | Enable minification | `false` |
| `-nocache` | Disable file caching | `false` |
| `-p <port>` | HTTP port | `3000` |
| `-sp <port>` | HTTPS port | `443` |

## Production Deployment

For production environments:

1. Enable security features in config.json
2. Configure build optimization:
```bash
node app.js -p 80 -min -compile -cc
```

3. Use process management (PM2 recommended):
```bash
npm install -g pm2
pm2 start app.js --name "vw-sandbox"
```

4. Set up reverse proxy (Nginx recommended) for SSL termination and load balancing
5. Configure monitoring and logging solutions
