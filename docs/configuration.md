# Configuration Guide

## Configuration File (config.json)

```json
{
  "server": {
    "port": 3000,
    "sslPort": 443,
    "datapath": "./data",
    "admin": "admin",
    "logLevel": 1
  },
  
  "build": {
    "minify": false,
    "compile": false,
    "version": 1,
    "useVersioning": false
  },
  
  "assets": {
    "hostLocally": true,
    "remoteServerURL": null
  },
  
  "security": {
    "sessionSecret": "CHANGE_THIS",
    "sessionKey": "virtual",
    "ssl": {
      "pfx": null,
      "passphrase": null,
      "ca": ["./ca1.pem", "./ca2.pem"]
    }
  },
  
  "integration": {
    "3DR": {
      "apiEndpoint": null,
      "apiKey": null,
      "username": null,
      "password": null,
      "useAuth": false
    },
    "lrs": {
      "endpoint": null,
      "username": "",
      "password": ""
    }
  },
  
  "email": {
    "enabled": false,
    "from": "",
    "service": "",
    "auth": {
      "user": "",
      "pass": ""
    }
  },
  
  "auth": {
    "facebook": {
      "appId": null,
      "appSecret": null,
      "callbackURL": "http://localhost:3000/adl/sandbox/auth/facebook/callback"
    },
    "twitter": {
      "consumerKey": null,
      "consumerSecret": null,
      "callbackURL": "http://localhost:3000/adl/sandbox/auth/twitter/callback"
    },
    "google": {
      "clientId": null,
      "clientSecret": null,
      "callbackURL": "http://localhost:3000/adl/sandbox/auth/google/callback"
    }
  }
}
```

## Asset Server Configuration

Assets can be hosted locally or on a remote server:

1. Local hosting:
```json
{
  "assets": {
    "hostLocally": true,
    "remoteServerURL": null
  }
}
```

2. Remote hosting:
```json
{
  "assets": {
    "hostLocally": false,
    "remoteServerURL": "https://assets.example.com"
  }
}
```

## 3D Repository Integration

The VW Sandbox can integrate with any compatible 3D Repository instance. Configure in the `integration.3DR` section:

1. Set `apiEndpoint` to your 3DR instance (e.g., "https://3dr.adlnet.gov/api/rest/")
2. Configure authentication:
   - Set `apiKey` to your 3DR API key
   - Set `username` and `password` for authenticated access
   - Enable auth with `useAuth: true`
