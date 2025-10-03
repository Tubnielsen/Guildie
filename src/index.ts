import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import db from './db.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Discord OAuth2 configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'your_discord_client_id';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'your_discord_client_secret';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

app.use(express.json());

// Middleware to authenticate requests
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const result = await db.getUserWithSession(token);
    if (!result) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = result.user;
    req.session = result.session;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Discord OAuth2 routes
app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
    `client_id=${DISCORD_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=identify%20email&` +
    `state=${state}`;

  res.json({
    auth_url: discordAuthUrl,
    state: state
  });
});

app.post('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code required' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokens = tokenResponse.data;

    // Get user information from Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    const discordUser = userResponse.data;

    // Create or update user in database
    const user = await db.createOrUpdateUser(discordUser, tokens);

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const session = await db.createSession(user.id, sessionToken);

    res.json({
      message: 'Authentication successful',
      user: {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
      },
      session_token: sessionToken,
      expires_at: session.expires_at
    });

  } catch (error: any) {
    console.error('Discord auth error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.response?.data?.error_description || error.message
    });
  }
});

// Protected route example
app.get('/api/user/profile', authenticateToken, async (req: any, res) => {
  res.json({
    user: {
      id: req.user.id,
      discord_id: req.user.discord_id,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      email: req.user.email,
      created_at: req.user.created_at,
      updated_at: req.user.updated_at
    }
  });
});

// Refresh Discord access token
app.post('/auth/refresh', authenticateToken, async (req: any, res) => {
  try {
    const refreshResponse = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: req.user.refresh_token,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const newTokens = refreshResponse.data;
    await db.updateUserTokens(req.user.id, newTokens);

    res.json({
      message: 'Tokens refreshed successfully',
      expires_at: Date.now() + (newTokens.expires_in * 1000)
    });

  } catch (error: any) {
    console.error('Token refresh error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Token refresh failed',
      details: error.response?.data?.error_description || error.message
    });
  }
});

// Logout route
app.post('/auth/logout', authenticateToken, async (req: any, res) => {
  try {
    await db.deleteSession(req.session.session_token);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discord OAuth URL: http://localhost:${PORT}/auth/discord`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  db.close();
  process.exit(0);
});