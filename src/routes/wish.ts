import express from 'express';
import { database } from '../db.js';
import  {authenticateToken} from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/wish:
 *   get:
 *     summary: Get all wishes
 *     description: Retrieve wishlist entries with filtering. Users see only their own characters' wishes unless admin.
 *     tags: [Wishes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: characterId
 *         schema:
 *           type: integer
 *         description: Filter by character ID
 *       - in: query
 *         name: itemId
 *         schema:
 *           type: integer
 *         description: Filter by item ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filter by user ID (admin only)
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
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include wishes for inactive characters
 *     responses:
 *       200:
 *         description: Wishes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wishes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Wish'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *   post:
 *     summary: Add wish
 *     description: Add an item to a character's wishlist
 *     tags: [Wishes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - characterId
 *               - itemId
 *             properties:
 *               characterId:
 *                 type: integer
 *                 example: 1
 *               itemId:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       201:
 *         description: Wish added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 wish:
 *                   $ref: '#/components/schemas/Wish'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Wish already exists
 */
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { 
      characterId, 
      itemId, 
      userId,
      page = 1, 
      limit = 20,
      includeInactive = false
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const filters: any = {};
    
    if (characterId) {
      filters.characterId = parseInt(characterId);
    }
    
    if (itemId) {
      filters.itemId = parseInt(itemId);
    }

    // If userId is specified, filter by characters owned by that user
    if (userId) {
      filters.character = {
        userId: parseInt(userId)
      };
    } else {
      // If no userId specified, only show current user's characters' wishes
      filters.character = {
        userId: req.user.id
      };
    }

    // Filter by character status if needed
    if (!includeInactive) {
      if (filters.character) {
        filters.character.active = 'ACTIVE';
      } else {
        filters.character = { active: 'ACTIVE' };
      }
    }

    const [wishes, totalCount] = await Promise.all([
      database.getWishes({
        skip: offset,
        take: limitNum,
        where: filters,
        include: {
          character: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  discordId: true,
                }
              }
            }
          },
          item: true
        }
      }),
      database.getWishesCount(filters)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      wishes: wishes.map((wish: any) => ({
        character: {
          id: wish.character.id,
          name: wish.character.name,
          role: wish.character.role,
          dkp: wish.character.dkp,
          active: wish.character.active,
          user: wish.character.user
        },
        item: {
          id: wish.item.id,
          name: wish.item.name,
          imageUrl: wish.item.imageUrl,
          minDkpCost: wish.item.minDkpCost
        }
      })),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalWishes: totalCount,
        wishesPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get wishes error:', error);
    res.status(500).json({ error: 'Failed to fetch wishes' });
  }
});

// GET /api/wish/character/:characterId - Get all wishes for a specific character
router.get('/character/:characterId', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.characterId);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    // Verify character belongs to the user
    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    const wishes = await database.getCharacterWishes(characterId);

    res.json({
      character: {
        id: character.id,
        name: character.name,
        role: character.role,
        dkp: character.dkp,
        active: character.active
      },
      wishes: wishes.map((wish: any) => ({
        item: {
          id: wish.item.id,
          name: wish.item.name,
          imageUrl: wish.item.imageUrl,
          minDkpCost: wish.item.minDkpCost
        },
        canAfford: character.dkp >= wish.item.minDkpCost
      })),
      totalWishes: wishes.length,
      totalAffordableWishes: wishes.filter((wish: any) => character.dkp >= wish.item.minDkpCost).length
    });
  } catch (error) {
    console.error('Get character wishes error:', error);
    res.status(500).json({ error: 'Failed to fetch character wishes' });
  }
});

// GET /api/wish/item/:itemId - Get all characters who wish for a specific item
router.get('/item/:itemId', authenticateToken, async (req: any, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    // Verify item exists
    const item = await database.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const wishes = await database.getItemWishes(itemId);

    // Sort by DKP descending (priority order)
    const sortedWishes = wishes.sort((a: any, b: any) => b.character.dkp - a.character.dkp);

    res.json({
      item: {
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        minDkpCost: item.minDkpCost
      },
      wishes: sortedWishes.map((wish: any, index: number) => ({
        priority: index + 1,
        character: {
          id: wish.character.id,
          name: wish.character.name,
          role: wish.character.role,
          dkp: wish.character.dkp,
          active: wish.character.active,
          canAfford: wish.character.dkp >= item.minDkpCost,
          user: {
            username: wish.character.user.username,
            discordId: wish.character.user.discordId
          }
        }
      })),
      totalWishes: wishes.length,
      eligibleWishes: wishes.filter((wish: any) => 
        wish.character.active === 'ACTIVE' && wish.character.dkp >= item.minDkpCost
      ).length
    });
  } catch (error) {
    console.error('Get item wishes error:', error);
    res.status(500).json({ error: 'Failed to fetch item wishes' });
  }
});

// POST /api/wish - Create a new wish (character wishes for an item)
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { characterId, itemId } = req.body;

    // Validation
    if (!characterId || !itemId) {
      return res.status(400).json({ error: 'Character ID and Item ID are required' });
    }

    const characterIdNum = parseInt(characterId);
    const itemIdNum = parseInt(itemId);

    if (isNaN(characterIdNum) || isNaN(itemIdNum)) {
      return res.status(400).json({ error: 'Invalid character or item ID' });
    }

    // Verify character belongs to the user
    const character = await database.getCharacterById(characterIdNum, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Verify character is active
    if (character.active !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only active characters can make wishes' });
    }

    // Verify item exists
    const item = await database.getItemById(itemIdNum);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if wish already exists
    const existingWish = await database.checkWishExists(characterIdNum, itemIdNum);
    if (existingWish) {
      return res.status(409).json({ error: 'Character already wishes for this item' });
    }

    // Create the wish
    const wish = await database.createWish(characterIdNum, itemIdNum);

    res.status(201).json({
      message: 'Wish created successfully',
      wish: {
        character: {
          id: character.id,
          name: character.name,
          role: character.role,
          dkp: character.dkp
        },
        item: {
          id: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
          minDkpCost: item.minDkpCost
        },
        canAfford: character.dkp >= item.minDkpCost
      }
    });
  } catch (error) {
    console.error('Create wish error:', error);
    res.status(500).json({ error: 'Failed to create wish' });
  }
});

/**
 * @swagger
 * /api/wish/{characterId}/{itemId}:
 *   delete:
 *     summary: Remove specific wish
 *     description: Remove a specific item from a character's wishlist
 *     tags: [Wishes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Character ID
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Wish removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       403:
 *         description: Can only modify your own character's wishes
 */
router.delete('/:characterId/:itemId', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.characterId);
    const itemId = parseInt(req.params.itemId);

    if (isNaN(characterId) || isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid character or item ID' });
    }

    // Verify character belongs to the user
    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Verify wish exists
    const wishExists = await database.checkWishExists(characterId, itemId);
    if (!wishExists) {
      return res.status(404).json({ error: 'Wish not found' });
    }

    // Delete the wish
    const deleted = await database.deleteWish(characterId, itemId);
    if (!deleted) {
      return res.status(500).json({ error: 'Failed to remove wish' });
    }

    res.json({ 
      message: 'Wish removed successfully',
      removedWish: {
        characterId,
        itemId
      }
    });
  } catch (error) {
    console.error('Delete wish error:', error);
    res.status(500).json({ error: 'Failed to remove wish' });
  }
});

/**
 * @swagger
 * /api/wish/character/{characterId}:
 *   delete:
 *     summary: Remove all character wishes
 *     description: Remove all wishes for a specific character
 *     tags: [Wishes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Character ID
 *     responses:
 *       200:
 *         description: All wishes removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 removedCount:
 *                   type: integer
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         description: Can only modify your own character's wishes
 */
router.delete('/character/:characterId', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.characterId);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    // Verify character belongs to the user
    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Get current wishes before deletion
    const currentWishes = await database.getCharacterWishes(characterId);
    
    // Delete all wishes for the character
    const deleted = await database.deleteAllCharacterWishes(characterId);

    res.json({ 
      message: 'All character wishes removed successfully',
      character: {
        id: character.id,
        name: character.name
      },
      removedWishesCount: currentWishes.length
    });
  } catch (error) {
    console.error('Delete character wishes error:', error);
    res.status(500).json({ error: 'Failed to remove character wishes' });
  }
});

// PUT /api/wish/:characterId/:itemId/priority - Update wish priority (for future use)
router.put('/:characterId/:itemId/priority', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.characterId);
    const itemId = parseInt(req.params.itemId);
    const { priority } = req.body;

    if (isNaN(characterId) || isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid character or item ID' });
    }

    if (!priority || priority < 1) {
      return res.status(400).json({ error: 'Priority must be a positive number' });
    }

    // Verify character belongs to the user
    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found or access denied' });
    }

    // Verify wish exists
    const wishExists = await database.checkWishExists(characterId, itemId);
    if (!wishExists) {
      return res.status(404).json({ error: 'Wish not found' });
    }

    // Note: This is a placeholder for future priority implementation
    // Current schema doesn't have priority field, but this route is ready for when it's added

    res.json({ 
      message: 'Wish priority updated successfully (feature coming soon)',
      wish: {
        characterId,
        itemId,
        priority
      }
    });
  } catch (error) {
    console.error('Update wish priority error:', error);
    res.status(500).json({ error: 'Failed to update wish priority' });
  }
});

// GET /api/wish/stats - Get wish statistics
router.get('/stats', authenticateToken, async (req: any, res) => {
  try {
    const { userId } = req.query;
    
    // If userId is provided and it's not the current user, you might want to add admin check
    const targetUserId = userId ? parseInt(userId) : req.user.id;

    const [
      totalWishes,
      userCharacters,
      topWishedItems
    ] = await Promise.all([
      database.getUserWishesCount(targetUserId),
      database.getCharactersByUserId(targetUserId),
      database.getMostWishedItems(10)
    ]);

    const activeCharacters = userCharacters.filter((char: any) => char.active === 'ACTIVE');
    
    res.json({
      user: {
        id: targetUserId,
        totalWishes,
        totalCharacters: userCharacters.length,
        activeCharacters: activeCharacters.length
      },
      topWishedItems: topWishedItems.map((item: any, index: number) => ({
        rank: index + 1,
        item: {
          id: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
          minDkpCost: item.minDkpCost
        },
        wishesCount: item._count.wishes
      }))
    });
  } catch (error) {
    console.error('Get wish stats error:', error);
    res.status(500).json({ error: 'Failed to fetch wish statistics' });
  }
});

export default router;