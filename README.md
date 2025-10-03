# STILL UNDER DEVELOPMENT

# Guildie - Guild Management REST API 

A TypeScript REST API that provides Discord OAuth2 authentication with SQLite database storage, Guild management tools to manage your guild such as: member list, wishlist system, DKP system, event planning and attendance tracking.

## Features

### Authentication through Discord
- Discord OAuth2 authentication flow
- SQLite database for user and session management
- Session-based authentication with tokens
- Token refresh functionality
- Protected route middleware
- Automatic session cleanup

### Guild Management Tool Features
- Individual character profile
- Member listings for whole guild
- Wishlist system for individual users using token system for limiting
- Event planner to plan future events for the guild
- Attendance Tracking to track attendance through the events from the event planner
- DKP System; gain DKP points through attendance of events.
- Custom Recruitment page with integrated survey tool, to allow outsiders to apply for the guild.
- Admin/Officer tools like:
  - Asking for gear and skill setup pictures
  - Limiting amount of things to wishlist (can be limited per gear type ex. chest, ring etc.)
  - Give out DKP, wishlist points and more manually to your members 
- More to come!

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

### Characters Table
```sql
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT UNIQUE NOT NULL,
  role TEXT CHECK(role IN ('DPS', 'TANK', 'HEALER')),
  weapon1 TEXT,
  weapon2 TEXT,
  combat_power INTEGER,
  gear_image_url TEXT,
  active TEXT CHECK(active IN ('ACTIVE', 'NOT ACTIVE')) NOT NULL DEFAULT 'ACTIVE',
  dkp INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

### Events Table
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  dkp_reward INTEGER NOT NULL DEFAULT 0
);
```

### Attendances Table
```sql
CREATE TABLE attendances (
  event_id INTEGER,
  character_id INTEGER,
  FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, character_id)
);
```

### Items Table
```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  image_url TEXT,
  min_dkp_cost INTEGER NOT NULL DEFAULT 1
);
```

### Wishes Table
```sql
CREATE TABLE wishes (
  character_id INTEGER,
  item_id INTEGER,
  FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, item_id)
);
```


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
