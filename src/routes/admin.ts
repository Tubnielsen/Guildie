import express from 'express';
import { database } from '../db.js';
import { authenticateToken, requireAdmin, requireOfficerOrAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     description: Retrieve all users with their roles and statistics
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [MEMBER, OFFICER, ADMIN]
 *         description: Filter by user role
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username or Discord ID
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/User'
 *                       - type: object
 *                         properties:
 *                           _count:
 *                             type: object
 *                             properties:
 *                               characters:
 *                                 type: integer
 *                               sessions:
 *                                 type: integer
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/users', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role,
      search 
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const filters: any = {};
    
    if (role && ['MEMBER', 'OFFICER', 'ADMIN'].includes(role)) {
      filters.role = role;
    }

    if (search) {
      filters.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { discordId: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Note: These will work after Prisma client is regenerated
    const users = await database.prisma.user.findMany({
      skip: offset,
      take: limitNum,
      where: filters,
      select: {
        id: true,
        discordId: true,
        username: true,
        discriminator: true,
        avatar: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            characters: true,
            sessions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const totalCount = await database.getUserCount();

    res.json({
      users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalUsers: totalCount,
        usersPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * @swagger
 * /api/admin/users/{userId}/role:
 *   put:
 *     summary: Update user role (Admin only)
 *     description: Change a user's role in the guild
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [MEMBER, OFFICER, ADMIN]
 *                 example: "OFFICER"
 *     responses:
 *       200:
 *         description: User role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Cannot demote yourself or invalid role
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User not found
 */
router.put('/users/:userId/role', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { role } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!['MEMBER', 'OFFICER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be MEMBER, OFFICER, or ADMIN' });
    }

    // Prevent self-demotion from admin
    if (req.user.id === userId && req.user.role === 'ADMIN' && role !== 'ADMIN') {
      return res.status(400).json({ error: 'Cannot demote yourself from admin role' });
    }

    const updatedUser = await database.updateUserRole(userId, role);
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User role updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// POST /api/admin/users/:userId/promote - Promote user (Admin only)
router.post('/users/:userId/promote', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const updatedUser = await database.promoteUser(userId);
    
    if (!updatedUser) {
      return res.status(400).json({ error: 'User not found or cannot be promoted further' });
    }

    res.json({
      message: 'User promoted successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

// POST /api/admin/users/:userId/demote - Demote user (Admin only)
router.post('/users/:userId/demote', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Prevent self-demotion
    if (req.user.id === userId && req.user.role === 'ADMIN') {
      return res.status(400).json({ error: 'Cannot demote yourself from admin role' });
    }

    const updatedUser = await database.demoteUser(userId);
    
    if (!updatedUser) {
      return res.status(400).json({ error: 'User not found or cannot be demoted further' });
    }

    res.json({
      message: 'User demoted successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error('Demote user error:', error);
    res.status(500).json({ error: 'Failed to demote user' });
  }
});

// GET /api/admin/stats - Enhanced admin statistics
router.get('/stats', authenticateToken, requireOfficerOrAdmin, async (req: any, res) => {
  try {
    const [
      totalUsers,
      activeSessionCount,
      totalCharacters,
      totalItems,
      totalWishes,
      totalEvents
    ] = await Promise.all([
      database.getUserCount(),
      database.getActiveSessionCount(),
      database.getCharacterCount(),
      database.getItemCount(),
      database.getWishesCount(),
      database.getEventCount()
    ]);

    // Role distribution (will work after Prisma regeneration)
    const roleStats = {
      members: 0, // await database.getUsersByRole('MEMBER').then(users => users.length),
      officers: 0, // await database.getUsersByRole('OFFICER').then(users => users.length),
      admins: 0 // await database.getUsersByRole('ADMIN').then(users => users.length)
    };

    res.json({
      users: {
        total: totalUsers,
        activeSessions: activeSessionCount,
        roles: roleStats
      },
      guild: {
        totalCharacters,
        totalItems,
        totalWishes,
        totalEvents
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

// GET /api/admin/audit-log - Basic audit log (future enhancement)
router.get('/audit-log', authenticateToken, requireAdmin, async (req: any, res) => {
  // This is a placeholder for future audit logging functionality
  res.json({
    message: 'Audit log functionality coming soon',
    events: []
  });
});

export default router;