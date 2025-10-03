# Guildie - Discord Authentication REST API

A TypeScript REST API that provides Discord OAuth2 authentication with SQLite database storage.

## Features

- Discord OAuth2 authentication flow
- SQLite database for user and session management
- Session-based authentication with tokens
- Token refresh functionality
- Protected route middleware
- Automatic session cleanup

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build and Run

```bash
# Development mode
npm run dev

# Build for production
npm run build

# Run production
npm start
```

## API Endpoints

### Authentication Endpoints

#### `GET /auth/discord`
Initiates Discord OAuth2 flow. Returns the authorization URL.

**Response:**
```json
{
  "auth_url": "https://discord.com/api/oauth2/authorize?...",
  "state": "random_state_string"
}
```

#### `POST /auth/discord/callback`
Handles the OAuth2 callback and creates a user session.

**Request Body:**
```json
{
  "code": "oauth_authorization_code",
  "state": "state_from_initial_request"
}
```

**Response:**
```json
{
  "message": "Authentication successful",
  "user": {
    "id": 1,
    "discord_id": "123456789",
    "username": "username",
    "discriminator": "0001",
    "avatar": "avatar_hash",
    "email": "user@example.com"
  },
  "session_token": "session_token_here",
  "expires_at": 1234567890
}
```

#### `POST /auth/refresh`
Refreshes the Discord access token (requires authentication).

**Headers:**
```
Authorization: Bearer your_session_token
```

**Response:**
```json
{
  "message": "Tokens refreshed successfully",
  "expires_at": 1234567890
}
```

#### `POST /auth/logout`
Logs out the user and invalidates the session (requires authentication).

**Headers:**
```
Authorization: Bearer your_session_token
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

### Protected Endpoints

#### `GET /api/user/profile`
Gets the current user's profile (requires authentication).

**Headers:**
```
Authorization: Bearer your_session_token
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "discord_id": "123456789",
    "username": "username",
    "discriminator": "0001",
    "avatar": "avatar_hash",
    "email": "user@example.com",
    "created_at": "2023-01-01T00:00:00.000Z",
    "updated_at": "2023-01-01T00:00:00.000Z"
  }
}
```

### Utility Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

## Authentication Flow

1. **Redirect to Discord:**
   ```javascript
   // Get the Discord OAuth URL
   const response = await fetch('/auth/discord');
   const { auth_url, state } = await response.json();
   
   // Redirect user to Discord
   window.location.href = auth_url;
   ```

2. **Handle Callback:**
   ```javascript
   // After Discord redirects back with code
   const urlParams = new URLSearchParams(window.location.search);
   const code = urlParams.get('code');
   const state = urlParams.get('state');
   
   // Exchange code for session token
   const response = await fetch('/auth/discord/callback', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ code, state })
   });
   
   const { session_token, user } = await response.json();
   
   // Store session token for future requests
   localStorage.setItem('session_token', session_token);
   ```

3. **Make Authenticated Requests:**
   ```javascript
   const sessionToken = localStorage.getItem('session_token');
   
   const response = await fetch('/api/user/profile', {
     headers: {
       'Authorization': `Bearer ${sessionToken}`
     }
   });
   
   const userData = await response.json();
   ```
## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  discriminator TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

## Security Considerations

1. **Environment Variables:** Never commit `.env` file with real credentials
2. **HTTPS:** Use HTTPS in production
3. **Session Tokens:** Generated using crypto.randomBytes for security
4. **Token Expiration:** Sessions expire automatically (default: 7 days)
5. **CORS:** Configure CORS for your frontend domain in production

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (missing parameters)
- `401` - Unauthorized (missing token)
- `403` - Forbidden (invalid/expired token)
- `500` - Internal Server Error

Error responses include a descriptive message:
```json
{
  "error": "Error description",
  "details": "Additional error details"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This software is proprietary and confidential. All rights reserved.
See LICENSE file for details.