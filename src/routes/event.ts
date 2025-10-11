import express from 'express';
import { database } from '../db.js';
import  {authenticateToken} from '../middleware/auth.js';

const router = express.Router();

// Helper function to generate recurring events
const generateRecurringEvents = (
  eventData: any, 
  recurrence: { 
    type: 'weekly';
    interval: number; // Every X weeks
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
    occurrences: number; // How many events to create
  }
) => {
  const events = [];
  const startDate = new Date(eventData.startTime);
  const endDate = new Date(eventData.endTime);
  const duration = endDate.getTime() - startDate.getTime();

  // Calculate days until target day of week
  const currentDayOfWeek = startDate.getDay();
  const daysUntilTarget = (recurrence.dayOfWeek - currentDayOfWeek + 7) % 7;
  
  // Set to the first occurrence
  const firstOccurrence = new Date(startDate);
  firstOccurrence.setDate(startDate.getDate() + daysUntilTarget);

  for (let i = 0; i < recurrence.occurrences; i++) {
    const eventStart = new Date(firstOccurrence);
    eventStart.setDate(firstOccurrence.getDate() + (i * 7 * recurrence.interval));
    
    const eventEnd = new Date(eventStart.getTime() + duration);
    
    events.push({
      title: `${eventData.title}${i > 0 ? ` (Week ${i + 1})` : ''}`,
      description: eventData.description,
      startTime: eventStart,
      endTime: eventEnd,
      dkpReward: eventData.dkpReward
    });
  }

  return events;
};

/**
 * @swagger
 * /api/event:
 *   get:
 *     summary: Get all events
 *     description: Retrieve events with filtering and pagination
 *     tags: [Events]
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
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter events starting after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter events ending before this date
 *       - in: query
 *         name: upcoming
 *         schema:
 *           type: boolean
 *         description: Filter for upcoming events only
 *       - in: query
 *         name: past
 *         schema:
 *           type: boolean
 *         description: Filter for past events only
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 */
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      upcoming = false,
      past = false,
      sortBy = 'startTime',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const filters: any = {};
    const now = new Date();

    if (startDate) {
      filters.startTime = {
        ...filters.startTime,
        gte: new Date(startDate)
      };
    }

    if (endDate) {
      filters.endTime = {
        ...filters.endTime,
        lte: new Date(endDate)
      };
    }

    if (upcoming === 'true') {
      filters.startTime = {
        ...filters.startTime,
        gte: now
      };
    }

    if (past === 'true') {
      filters.endTime = {
        ...filters.endTime,
        lt: now
      };
    }

    // Build sort order
    const orderBy: any = {};
    if (['startTime', 'endTime', 'title', 'dkpReward'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.startTime = 'asc'; // Default sort
    }

    const [events, totalCount] = await Promise.all([
      database.getEvents({
        skip: offset,
        take: limitNum,
        where: filters,
        orderBy
      }),
      database.getEventCount(filters)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      events: events.map((event: any) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        dkpReward: event.dkpReward,
        attendanceCount: event.attendances?.length || 0,
        isUpcoming: event.startTime > now,
        isPast: event.endTime < now,
        isOngoing: event.startTime <= now && event.endTime >= now
      })),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalEvents: totalCount,
        eventsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * @swagger
 * /api/event/{id}:
 *   get:
 *     summary: Get event by ID
 *     description: Retrieve a specific event with attendance details
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 event:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Event'
 *                     - type: object
 *                       properties:
 *                         attendances:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               character:
 *                                 $ref: '#/components/schemas/Character'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const event = await database.getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const now = new Date();

    res.json({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        dkpReward: event.dkpReward,
        isUpcoming: event.startTime > now,
        isPast: event.endTime < now,
        isOngoing: event.startTime <= now && event.endTime >= now,
        attendances: event.attendances?.map((attendance: any) => ({
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
        })) || [],
        attendanceCount: event.attendances?.length || 0
      }
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/**
 * @swagger
 * /api/event:
 *   post:
 *     summary: Create event with recurrence
 *     description: Create a single event or recurring weekly events
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - startTime
 *               - endTime
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Weekly Raid Night"
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 nullable: true
 *                 example: "Guild raid every Tuesday"
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-10-15T20:00:00Z"
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-10-15T23:00:00Z"
 *               dkpReward:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 example: 50
 *               recurrence:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [weekly]
 *                   interval:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 4
 *                     default: 1
 *                     description: "Every X weeks"
 *                   dayOfWeek:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 6
 *                     description: "0=Sunday, 1=Monday, etc."
 *                   occurrences:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 52
 *                     description: "Number of events to create"
 *     responses:
 *       201:
 *         description: Event(s) created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 event:
 *                   $ref: '#/components/schemas/Event'
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                   description: "Array of events when recurrence is used"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      dkpReward = 0,
      recurrence // Optional: { type: 'weekly', interval: 1, dayOfWeek: 0, occurrences: 4 }
    } = req.body;

    // Validation
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Start time and end time are required' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (start >= end) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }

    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }

    if (description && description.length > 1000) {
      return res.status(400).json({ error: 'Description must be 1000 characters or less' });
    }

    const dkp = parseInt(dkpReward) || 0;
    if (dkp < 0) {
      return res.status(400).json({ error: 'DKP reward cannot be negative' });
    }

    const eventData = {
      title: title.trim(),
      description: description?.trim() || null,
      startTime: start,
      endTime: end,
      dkpReward: dkp
    };

    // Handle recurrence
    if (recurrence && recurrence.type === 'weekly') {
      // Validate recurrence parameters
      if (!recurrence.occurrences || recurrence.occurrences < 1 || recurrence.occurrences > 52) {
        return res.status(400).json({ error: 'Occurrences must be between 1 and 52' });
      }

      if (recurrence.interval < 1 || recurrence.interval > 4) {
        return res.status(400).json({ error: 'Interval must be between 1 and 4 weeks' });
      }

      if (recurrence.dayOfWeek < 0 || recurrence.dayOfWeek > 6) {
        return res.status(400).json({ error: 'Day of week must be between 0 (Sunday) and 6 (Saturday)' });
      }

      // Generate recurring events
      const recurringEvents = generateRecurringEvents(eventData, {
        type: 'weekly',
        interval: recurrence.interval || 1,
        dayOfWeek: recurrence.dayOfWeek,
        occurrences: recurrence.occurrences
      });

      // Create all recurring events
      const createdEvents = [];
      for (const eventToCreate of recurringEvents) {
        const event = await database.createEvent(eventToCreate);
        createdEvents.push(event);
      }

      res.status(201).json({
        message: `${createdEvents.length} recurring events created successfully`,
        recurrence: {
          type: 'weekly',
          interval: recurrence.interval,
          dayOfWeek: recurrence.dayOfWeek,
          occurrences: recurrence.occurrences
        },
        events: createdEvents.map((event: any) => ({
          id: event.id,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          dkpReward: event.dkpReward
        }))
      });
    } else {
      // Create single event
      const event = await database.createEvent(eventData);

      res.status(201).json({
        message: 'Event created successfully',
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          dkpReward: event.dkpReward
        }
      });
    }
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

/**
 * @swagger
 * /api/event/{id}:
 *   put:
 *     summary: Update event
 *     description: Update an existing event
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 nullable: true
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               dkpReward:
 *                 type: integer
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   delete:
 *     summary: Delete event
 *     description: Delete an event and all associated attendances
 *     tags: [Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedEvent:
 *                   type: object
 *                 removedAttendances:
 *                   type: integer
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const { title, description, startTime, endTime, dkpReward } = req.body;

    // Check if event exists
    const existingEvent = await database.getEventById(eventId);
    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Validation
    const updateData: any = {};

    if (title !== undefined) {
      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      if (title.length > 200) {
        return res.status(400).json({ error: 'Title must be 200 characters or less' });
      }
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      if (description && description.length > 1000) {
        return res.status(400).json({ error: 'Description must be 1000 characters or less' });
      }
      updateData.description = description?.trim() || null;
    }

    if (startTime !== undefined) {
      const start = new Date(startTime);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: 'Invalid start time format' });
      }
      updateData.startTime = start;
    }

    if (endTime !== undefined) {
      const end = new Date(endTime);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid end time format' });
      }
      updateData.endTime = end;
    }

    // Check if start time is before end time
    const finalStartTime = updateData.startTime || existingEvent.startTime;
    const finalEndTime = updateData.endTime || existingEvent.endTime;
    
    if (finalStartTime >= finalEndTime) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }

    if (dkpReward !== undefined) {
      const dkp = parseInt(dkpReward);
      if (isNaN(dkp) || dkp < 0) {
        return res.status(400).json({ error: 'DKP reward must be a non-negative number' });
      }
      updateData.dkpReward = dkp;
    }

    const updatedEvent = await database.updateEvent(eventId, updateData);

    res.json({
      message: 'Event updated successfully',
      event: {
        id: updatedEvent.id,
        title: updatedEvent.title,
        description: updatedEvent.description,
        startTime: updatedEvent.startTime,
        endTime: updatedEvent.endTime,
        dkpReward: updatedEvent.dkpReward
      }
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/event/:id - Delete an event
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Check if event exists
    const existingEvent = await database.getEventById(eventId);
    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if event has attendances
    const attendanceCount = existingEvent.attendances?.length || 0;
    
    const deleted = await database.deleteEvent(eventId);
    if (!deleted) {
      return res.status(500).json({ error: 'Failed to delete event' });
    }

    res.json({
      message: 'Event deleted successfully',
      deletedEvent: {
        id: existingEvent.id,
        title: existingEvent.title,
        startTime: existingEvent.startTime,
        endTime: existingEvent.endTime
      },
      removedAttendances: attendanceCount
    });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// GET /api/event/upcoming - Get upcoming events (next 7 days)
router.get('/upcoming/list', authenticateToken, async (req: any, res) => {
  try {
    const { days = 7, limit = 10 } = req.query;
    
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + parseInt(days));

    const events = await database.getEvents({
      where: {
        startTime: {
          gte: now,
          lte: futureDate
        }
      },
      orderBy: {
        startTime: 'asc'
      },
      take: parseInt(limit)
    });

    res.json({
      upcomingEvents: events.map((event: any) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        dkpReward: event.dkpReward,
        attendanceCount: event.attendances?.length || 0,
        timeUntilStart: Math.floor((event.startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) // days
      })),
      totalEvents: events.length,
      queryDays: parseInt(days)
    });
  } catch (error) {
    console.error('Get upcoming events error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming events' });
  }
});

// GET /api/event/stats - Get event statistics
router.get('/stats/summary', authenticateToken, async (req: any, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    const [
      totalEvents,
      upcomingEvents,
      pastEvents,
      recentEvents
    ] = await Promise.all([
      database.getEventCount(),
      database.getEventCount({
        startTime: { gte: now }
      }),
      database.getEventCount({
        endTime: { lt: now }
      }),
      database.getEventCount({
        startTime: { gte: thirtyDaysAgo }
      })
    ]);

    res.json({
      statistics: {
        totalEvents,
        upcomingEvents,
        pastEvents,
        recentEvents, // Last 30 days
        avgEventsPerWeek: Math.round((recentEvents / 4) * 10) / 10
      },
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('Get event stats error:', error);
    res.status(500).json({ error: 'Failed to fetch event statistics' });
  }
});

export default router;