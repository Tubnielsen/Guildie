import express from 'express';
import { database } from '../db.js';
import { authenticateToken, requireOfficerOrAdmin, requireOwnershipOrAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/attendance:
 *   get:
 *     summary: Get attendance records
 *     description: Retrieve attendance records with filtering and pagination. Regular users see only their own character attendances.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: eventId
 *         schema:
 *           type: integer
 *         description: Filter by specific event ID
 *       - in: query
 *         name: characterId
 *         schema:
 *           type: integer
 *         description: Filter by specific character ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filter by user ID (Officers+ only)
 *     responses:
 *       200:
 *         description: Attendance records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attendances:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Attendance'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   post:
 *     summary: Add attendance record
 *     description: Record attendance for a character at an event. Awards DKP automatically.
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *               - characterId
 *             properties:
 *               eventId:
 *                 type: integer
 *                 description: Event ID
 *                 example: 1
 *               characterId:
 *                 type: integer
 *                 description: Character ID (must be owned by user unless Officer+)
 *                 example: 2
 *     responses:
 *       201:
 *         description: Attendance recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Attendance recorded successfully"
 *                 attendance:
 *                   type: object
 *                   properties:
 *                     eventId:
 *                       type: integer
 *                     characterId:
 *                       type: integer
 *                     dkpAwarded:
 *                       type: integer
 *                       description: DKP points awarded for attendance
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: Attendance already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      eventId,
      characterId,
      userId,
      sortBy = 'eventId',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const filters: any = {};
    
    if (eventId) {
      const eventIdNum = parseInt(eventId);
      if (!isNaN(eventIdNum)) {
        filters.eventId = eventIdNum;
      }
    }

    if (characterId) {
      const characterIdNum = parseInt(characterId);
      if (!isNaN(characterIdNum)) {
        filters.characterId = characterIdNum;
      }
    }

    // If userId is provided, filter by characters owned by that user
    if (userId) {
      const userIdNum = parseInt(userId);
      if (!isNaN(userIdNum)) {
        filters.character = {
          userId: userIdNum
        };
      }
    }

    // Non-admins can only see their own character attendances
    if (req.user.role !== 'ADMIN' && req.user.role !== 'OFFICER') {
      filters.character = {
        userId: req.user.id
      };
    }

    // Build sort order
    const orderBy: any = {};
    if (['eventId', 'characterId'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.eventId = 'desc'; // Default sort by most recent events
    }

    const attendances = await database.getAttendances({
      skip: offset,
      take: limitNum,
      where: filters,
      orderBy,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            dkpReward: true
          }
        },
        character: {
          select: {
            id: true,
            name: true,
            role: true,
            dkp: true,
            user: {
              select: {
                id: true,
                username: true,
                discordId: true
              }
            }
          }
        }
      }
    });

    const totalCount = await database.getAttendanceCount(filters);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      attendances: attendances.map((attendance: any) => ({
        eventId: attendance.eventId,
        characterId: attendance.characterId,
        event: {
          id: attendance.event.id,
          title: attendance.event.title,
          startTime: attendance.event.startTime,
          endTime: attendance.event.endTime,
          dkpReward: attendance.event.dkpReward
        },
        character: {
          id: attendance.character.id,
          name: attendance.character.name,
          role: attendance.character.role,
          dkp: attendance.character.dkp,
          user: {
            id: attendance.character.user.id,
            username: attendance.character.user.username,
            discordId: attendance.character.user.discordId
          }
        }
      })),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalAttendances: totalCount,
        attendancesPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get attendances error:', error);
    res.status(500).json({ error: 'Failed to fetch attendances' });
  }
});

// GET /api/attendance/event/:eventId - Get all attendances for a specific event
router.get('/event/:eventId', authenticateToken, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Check if event exists
    const event = await database.getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const attendances = await database.getEventAttendances(eventId);

    res.json({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        dkpReward: event.dkpReward
      },
      attendances: attendances.map((attendance: any) => ({
        character: {
          id: attendance.character.id,
          name: attendance.character.name,
          role: attendance.character.role,
          dkp: attendance.character.dkp,
          user: {
            username: attendance.character.user.username,
            discordId: attendance.character.user.discordId
          }
        }
      })),
      totalAttendees: attendances.length
    });
  } catch (error) {
    console.error('Get event attendances error:', error);
    res.status(500).json({ error: 'Failed to fetch event attendances' });
  }
});

// GET /api/attendance/character/:characterId - Get all attendances for a specific character
router.get('/character/:characterId', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.characterId);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    // Check if character exists and user has permission to view
    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character && req.user.role !== 'ADMIN' && req.user.role !== 'OFFICER') {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    const attendances = await database.getCharacterAttendances(characterId);

    res.json({
      character: character || await database.getCharacterByIdAdmin(characterId),
      attendances: attendances.map((attendance: any) => ({
        event: {
          id: attendance.event.id,
          title: attendance.event.title,
          description: attendance.event.description,
          startTime: attendance.event.startTime,
          endTime: attendance.event.endTime,
          dkpReward: attendance.event.dkpReward
        }
      })),
      totalAttendances: attendances.length,
      totalDkpEarned: attendances.reduce((total: number, attendance: any) => 
        total + attendance.event.dkpReward, 0)
    });
  } catch (error) {
    console.error('Get character attendances error:', error);
    res.status(500).json({ error: 'Failed to fetch character attendances' });
  }
});

// POST /api/attendance - Add attendance record (Officers+ or character owner)
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { eventId, characterId } = req.body;

    // Validation
    if (!eventId || !characterId) {
      return res.status(400).json({ error: 'Event ID and Character ID are required' });
    }

    const eventIdNum = parseInt(eventId);
    const characterIdNum = parseInt(characterId);

    if (isNaN(eventIdNum) || isNaN(characterIdNum)) {
      return res.status(400).json({ error: 'Invalid event ID or character ID' });
    }

    // Check if event exists
    const event = await database.getEventById(eventIdNum);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if character exists and user has permission
    const character = await database.getCharacterById(characterIdNum, req.user.id);
    if (!character && req.user.role !== 'ADMIN' && req.user.role !== 'OFFICER') {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Check if attendance already exists
    const existingAttendance = await database.checkAttendanceExists(eventIdNum, characterIdNum);
    if (existingAttendance) {
      return res.status(409).json({ error: 'Attendance record already exists for this event and character' });
    }

    // Add attendance
    const attendance = await database.addAttendance(eventIdNum, characterIdNum);

    // Award DKP if event has reward
    if (event.dkpReward > 0) {
      await database.updateCharacterDkp(characterIdNum, event.dkpReward);
    }

    res.status(201).json({
      message: 'Attendance recorded successfully',
      attendance: {
        eventId: eventIdNum,
        characterId: characterIdNum,
        dkpAwarded: event.dkpReward
      },
      event: {
        id: event.id,
        title: event.title,
        startTime: event.startTime,
        dkpReward: event.dkpReward
      }
    });
  } catch (error) {
    console.error('Add attendance error:', error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

/**
 * @swagger
 * /api/attendance/bulk:
 *   post:
 *     summary: Bulk add attendance (Officers+ only)
 *     description: Add attendance for multiple characters to an event
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *               - characterIds
 *             properties:
 *               eventId:
 *                 type: integer
 *                 example: 1
 *               characterIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 minItems: 1
 *                 example: [1, 2, 3, 4, 5]
 *     responses:
 *       201:
 *         description: Bulk attendance processing completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 successful:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       characterId:
 *                         type: integer
 *                       success:
 *                         type: boolean
 *                       dkpAwarded:
 *                         type: integer
 *                 failed:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       characterId:
 *                         type: integer
 *                       error:
 *                         type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/bulk', authenticateToken, requireOfficerOrAdmin, async (req: any, res) => {
  try {
    const { eventId, characterIds } = req.body;

    // Validation
    if (!eventId || !Array.isArray(characterIds) || characterIds.length === 0) {
      return res.status(400).json({ error: 'Event ID and array of character IDs are required' });
    }

    const eventIdNum = parseInt(eventId);
    if (isNaN(eventIdNum)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Check if event exists
    const event = await database.getEventById(eventIdNum);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const results = [];
    const errors = [];

    for (const characterId of characterIds) {
      const characterIdNum = parseInt(characterId);
      if (isNaN(characterIdNum)) {
        errors.push({ characterId, error: 'Invalid character ID' });
        continue;
      }

      try {
        // Check if attendance already exists
        const existingAttendance = await database.checkAttendanceExists(eventIdNum, characterIdNum);
        if (existingAttendance) {
          errors.push({ characterId: characterIdNum, error: 'Attendance already exists' });
          continue;
        }

        // Add attendance
        await database.addAttendance(eventIdNum, characterIdNum);

        // Award DKP if event has reward
        if (event.dkpReward > 0) {
          await database.updateCharacterDkp(characterIdNum, event.dkpReward);
        }

        results.push({ 
          characterId: characterIdNum, 
          success: true,
          dkpAwarded: event.dkpReward
        });
      } catch (error) {
        errors.push({ characterId: characterIdNum, error: 'Failed to record attendance' });
      }
    }

    res.status(201).json({
      message: 'Bulk attendance processing completed',
      event: {
        id: event.id,
        title: event.title,
        dkpReward: event.dkpReward
      },
      successful: results,
      failed: errors,
      summary: {
        total: characterIds.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('Bulk add attendance error:', error);
    res.status(500).json({ error: 'Failed to process bulk attendance' });
  }
});

/**
 * @swagger
 * /api/attendance:
 *   delete:
 *     summary: Remove attendance record
 *     description: Remove an attendance record and reverse DKP award
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *               - characterId
 *             properties:
 *               eventId:
 *                 type: integer
 *                 example: 1
 *               characterId:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Attendance removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 removedAttendance:
 *                   type: object
 *                   properties:
 *                     eventId:
 *                       type: integer
 *                     characterId:
 *                       type: integer
 *                     dkpReversed:
 *                       type: integer
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       403:
 *         description: Can only remove attendance for your own characters
 */
router.delete('/', authenticateToken, async (req: any, res) => {
  try {
    const { eventId, characterId } = req.body;

    // Validation
    if (!eventId || !characterId) {
      return res.status(400).json({ error: 'Event ID and Character ID are required' });
    }

    const eventIdNum = parseInt(eventId);
    const characterIdNum = parseInt(characterId);

    if (isNaN(eventIdNum) || isNaN(characterIdNum)) {
      return res.status(400).json({ error: 'Invalid event ID or character ID' });
    }

    // Check if character exists and user has permission
    const character = await database.getCharacterById(characterIdNum, req.user.id);
    if (!character && req.user.role !== 'ADMIN' && req.user.role !== 'OFFICER') {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Check if attendance exists
    const existingAttendance = await database.checkAttendanceExists(eventIdNum, characterIdNum);
    if (!existingAttendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Get event details for DKP reversal
    const event = await database.getEventById(eventIdNum);
    
    // Remove attendance
    const removed = await database.removeAttendance(eventIdNum, characterIdNum);
    if (!removed) {
      return res.status(500).json({ error: 'Failed to remove attendance' });
    }

    // Reverse DKP if event had reward
    if (event && event.dkpReward > 0) {
      await database.updateCharacterDkp(characterIdNum, -event.dkpReward);
    }

    res.json({
      message: 'Attendance removed successfully',
      removedAttendance: {
        eventId: eventIdNum,
        characterId: characterIdNum,
        dkpReversed: event?.dkpReward || 0
      }
    });
  } catch (error) {
    console.error('Remove attendance error:', error);
    res.status(500).json({ error: 'Failed to remove attendance' });
  }
});

// GET /api/attendance/stats - Get attendance statistics (Officers+ only)
router.get('/stats', authenticateToken, requireOfficerOrAdmin, async (req: any, res) => {
  try {
    const { 
      startDate,
      endDate,
      characterId,
      userId
    } = req.query;

    // Build filters for date range
    const eventFilters: any = {};
    if (startDate) {
      eventFilters.startTime = {
        ...eventFilters.startTime,
        gte: new Date(startDate)
      };
    }
    if (endDate) {
      eventFilters.startTime = {
        ...eventFilters.startTime,
        lte: new Date(endDate)
      };
    }

    // Build attendance filters
    const attendanceFilters: any = {};
    if (characterId) {
      attendanceFilters.characterId = parseInt(characterId);
    }
    if (userId) {
      attendanceFilters.character = {
        userId: parseInt(userId)
      };
    }

    // If event filters exist, add them to attendance filters
    if (Object.keys(eventFilters).length > 0) {
      attendanceFilters.event = eventFilters;
    }

    const [
      totalAttendances,
      uniqueEvents,
      uniqueCharacters,
      topAttenders
    ] = await Promise.all([
      database.getAttendanceCount(attendanceFilters),
      database.getUniqueEventCount(attendanceFilters),
      database.getUniqueCharacterCount(attendanceFilters),
      database.getTopAttenders(10, attendanceFilters)
    ]);

    res.json({
      statistics: {
        totalAttendances,
        uniqueEvents,
        uniqueCharacters,
        averageAttendancePerEvent: uniqueEvents > 0 ? Math.round((totalAttendances / uniqueEvents) * 10) / 10 : 0
      },
      topAttenders,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        characterId: characterId || null,
        userId: userId || null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance statistics' });
  }
});

export default router;