import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { database } from './db.js';
import { swaggerSpec } from './config/swagger.js';
import characterRouter from './routes/character.js';
import itemRouter from './routes/item.js';
import wishRouter from './routes/wish.js';
import eventRouter from './routes/event.js';
import adminRouter from './routes/admin.js';
import attendanceRouter from './routes/attendance.js';
import { authenticateToken } from './middleware/auth.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Discord OAuth2 configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'your_discord_client_id';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'your_discord_client_secret';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';

app.use(express.json());

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Guildie API Documentation'
}));

// Swagger JSON endpoint
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Root endpoint
 *     description: Returns basic API information and available endpoints
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "Guildie API"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 description:
 *                   type: string
 *                   example: "Guild management REST API"
 *                 documentation:
 *                   type: string
 *                   example: "/api/docs"
 *                 endpoints:
 *                   type: object
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Guildie API',
    version: '1.0.0',
    description: 'Guild management REST API with Discord authentication',
    documentation: '/api/docs',
    endpoints: {
      authentication: '/auth/discord',
      users: '/api/user/profile',
      characters: '/api/character',
      items: '/api/item',
      events: '/api/event',
      attendance: '/api/attendance',
      wishes: '/api/wish',
      admin: '/api/admin'
    }
  });
});

// Discord OAuth2 routes

/**
 * @swagger
 * /auth/discord:
 *   get:
 *     summary: Get Discord OAuth URL
 *     description: Returns the Discord OAuth2 authorization URL for user authentication
 *     tags: [Authentication]
 *     security: []
 *     responses:
 *       200:
 *         description: Discord OAuth URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auth_url:
 *                   type: string
 *                   description: Discord OAuth2 authorization URL
 *                   example: "https://discord.com/api/oauth2/authorize?client_id=..."
 *                 state:
 *                   type: string
 *                   description: CSRF protection state parameter
 *                   example: "abc123def456"
 */
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

/**
 * @swagger
 * /auth/discord/callback:
 *   post:
 *     summary: Discord OAuth callback
 *     description: Process the Discord OAuth2 callback and create user session
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: Authorization code from Discord
 *                 example: "abc123def456"
 *               state:
 *                 type: string
 *                 description: State parameter for CSRF protection
 *                 example: "xyz789"
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Authentication successful"
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 session_token:
 *                   type: string
 *                   description: Session token for API authentication
 *                   example: "sess_abc123def456..."
 *                 expires_at:
 *                   type: integer
 *                   description: Session expiration timestamp
 *                   example: 1697123456789
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

    // Create or update user in database using Prisma
    const user = await database.createOrUpdateUser(discordUser, tokens);

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const session = await database.createSession(user.id, sessionToken);

    res.json({
      message: 'Authentication successful',
      user: {
        id: user.id,
        discord_id: user.discordId,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
      },
      session_token: sessionToken,
      expires_at: Number(session.expiresAt)
    });

  } catch (error: any) {
    console.error('Discord auth error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.response?.data?.error_description || error.message
    });
  }
});

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieve the authenticated user's profile information
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
app.get('/api/user/profile', authenticateToken, async (req: any, res) => {
  res.json({
    user: {
      id: req.user.id,
      discord_id: req.user.discordId,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      email: req.user.email,
      created_at: req.user.createdAt,
      updated_at: req.user.updatedAt
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
        refresh_token: req.user.refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const newTokens = refreshResponse.data;
    const expiresAt = BigInt(Date.now() + (newTokens.expires_in * 1000));
    
    await database.updateUserTokens(req.user.id, {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresAt: expiresAt
    });

    res.json({
      message: 'Tokens refreshed successfully',
      expires_at: Number(expiresAt)
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
    await database.deleteSession(req.session.sessionToken);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Basic stats route (public)
app.get('/api/stats', async (req, res) => {
  try {
    const userCount = await database.getUserCount();
    const activeSessionCount = await database.getActiveSessionCount();
    
    res.json({
      total_users: userCount,
      active_sessions: activeSessionCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// API Routes
app.use('/api/character', characterRouter);
app.use('/api/item', itemRouter);
app.use('/api/wish', wishRouter);
app.use('/api/event', eventRouter);
app.use('/api/admin', adminRouter);
app.use('/api/attendance', attendanceRouter);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API server is running and healthy
 *     tags: [General]
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
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
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Clean up expired sessions every hour
setInterval(async () => {
  try {
    await database.deleteExpiredSessions();
    console.log('Cleaned up expired sessions');
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
  }
}, 60 * 60 * 1000);