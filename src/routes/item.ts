import express from 'express';
import { database } from '../db.js';
import { authenticateToken, requireAdmin, requireOfficerOrAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/item:
 *   get:
 *     summary: Get all items
 *     description: Retrieve items with pagination, search, and filtering
 *     tags: [Items]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search items by name
 *       - in: query
 *         name: minDkp
 *         schema:
 *           type: integer
 *         description: Minimum DKP cost filter
 *       - in: query
 *         name: maxDkp
 *         schema:
 *           type: integer
 *         description: Maximum DKP cost filter
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, minDkpCost, id]
 *           default: name
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Item'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      minDkp, 
      maxDkp,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const filters: any = {};
    
    if (search) {
      filters.name = {
        contains: search,
        mode: 'insensitive'
      };
    }

    if (minDkp || maxDkp) {
      filters.minDkpCost = {};
      if (minDkp) filters.minDkpCost.gte = parseInt(minDkp);
      if (maxDkp) filters.minDkpCost.lte = parseInt(maxDkp);
    }

    // Build sort order
    const orderBy: any = {};
    if (['name', 'minDkpCost', 'id'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.name = 'asc'; // Default sort
    }

    const [items, totalCount] = await Promise.all([
      database.getItems({
        skip: offset,
        take: limitNum,
        where: filters,
        orderBy
      }),
      database.getItemCount(filters)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      items,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: totalCount,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

/**
 * @swagger
 * /api/item/{id}:
 *   get:
 *     summary: Get item by ID
 *     description: Retrieve a specific item by ID with wish count
 *     tags: [Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Item'
 *                     - type: object
 *                       properties:
 *                         wishesCount:
 *                           type: integer
 *                           description: Number of characters wanting this item
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    const item = await database.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get wishes count for this item
    const wishesCount = await database.getItemWishesCount(itemId);

    res.json({ 
      item: {
        ...item,
        wishesCount
      }
    });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

/**
 * @swagger
 * /api/item:
 *   post:
 *     summary: Create new item (Admin only)
 *     description: Create a new item in the guild database
 *     tags: [Items]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Legendary Sword of Power"
 *               imageUrl:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 example: "https://example.com/sword.jpg"
 *               minDkpCost:
 *                 type: integer
 *                 minimum: 0
 *                 default: 1
 *                 example: 100
 *     responses:
 *       201:
 *         description: Item created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Item created successfully"
 *                 item:
 *                   $ref: '#/components/schemas/Item'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         description: Item name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const { name, imageUrl, minDkpCost } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (name.length > 200) {
      return res.status(400).json({ error: 'Name must be 200 characters or less' });
    }

    if (minDkpCost !== undefined) {
      const dkpCost = parseInt(minDkpCost);
      if (isNaN(dkpCost) || dkpCost < 0) {
        return res.status(400).json({ error: 'Minimum DKP cost must be a non-negative number' });
      }
    }

    if (imageUrl && imageUrl.length > 500) {
      return res.status(400).json({ error: 'Image URL must be 500 characters or less' });
    }

    // Check if item name already exists
    const existingItem = await database.getItemByName(name.trim());
    if (existingItem) {
      return res.status(409).json({ error: 'An item with this name already exists' });
    }

    const itemData = {
      name: name.trim(),
      imageUrl: imageUrl?.trim() || null,
      minDkpCost: minDkpCost ? parseInt(minDkpCost) : 1
    };

    const item = await database.createItem(itemData);
    
    res.status(201).json({
      message: 'Item created successfully',
      item
    });
  } catch (error: any) {
    console.error('Create item error:', error);
    if (error.code === 'P2002') { // Unique constraint violation Prisma error code
      res.status(409).json({ error: 'An item with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create item' });
    }
  }
});

/**
 * @swagger
 * /api/item/{id}:
 *   put:
 *     summary: Update item (Admin only)
 *     description: Update an existing item's properties
 *     tags: [Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 200
 *               imageUrl:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *               minDkpCost:
 *                 type: integer
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 item:
 *                   $ref: '#/components/schemas/Item'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: Item name already exists
 */
router.put('/:id', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    const { name, imageUrl, minDkpCost } = req.body;

    // Validation
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      if (name.length > 200) {
        return res.status(400).json({ error: 'Name must be 200 characters or less' });
      }
    }

    if (minDkpCost !== undefined) {
      const dkpCost = parseInt(minDkpCost);
      if (isNaN(dkpCost) || dkpCost < 0) {
        return res.status(400).json({ error: 'Minimum DKP cost must be a non-negative number' });
      }
    }

    if (imageUrl !== undefined && imageUrl && imageUrl.length > 500) {
      return res.status(400).json({ error: 'Image URL must be 500 characters or less' });
    }

    // Check if item exists
    const existingItem = await database.getItemById(itemId);
    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if new name conflicts with existing item (if name is being changed)
    if (name && name.trim() !== existingItem.name) {
      const nameConflict = await database.getItemByName(name.trim());
      if (nameConflict) {
        return res.status(409).json({ error: 'An item with this name already exists' });
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;
    if (minDkpCost !== undefined) updateData.minDkpCost = parseInt(minDkpCost);

    const item = await database.updateItem(itemId, updateData);

    res.json({
      message: 'Item updated successfully',
      item
    });
  } catch (error) {
    console.error('Update item error:', error);
    if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'P2002') {
      res.status(409).json({ error: 'An item with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update item' });
    }
  }
});

/**
 * @swagger
 * /api/item/{id}:
 *   delete:
 *     summary: Delete item (Officer+ only)
 *     description: Delete an item if it has no wishes
 *     tags: [Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedItem:
 *                   $ref: '#/components/schemas/Item'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: Cannot delete item with existing wishes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
router.delete('/:id', authenticateToken, requireOfficerOrAdmin, async (req: any, res) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    // Check if item exists
    const existingItem = await database.getItemById(itemId);
    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if item has wishes (you might want to prevent deletion or cascade)
    const wishesCount = await database.getItemWishesCount(itemId);
    if (wishesCount > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete item with existing wishes',
        details: `This item has ${wishesCount} wish(es). Remove all wishes first or use force delete.`
      });
    }

    const deleted = await database.deleteItem(itemId);
    if (!deleted) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ 
      message: 'Item deleted successfully',
      deletedItem: existingItem
    });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/**
 * @swagger
 * /api/item/{id}/force:
 *   delete:
 *     summary: Force delete item (Admin only)
 *     description: Delete an item and remove all associated wishes
 *     tags: [Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item and wishes deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedItem:
 *                   $ref: '#/components/schemas/Item'
 *                 removedWishes:
 *                   type: integer
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.delete('/:id/force', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    // Check if item exists
    const existingItem = await database.getItemById(itemId);
    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get wishes count before deletion
    const wishesCount = await database.getItemWishesCount(itemId);

    // Force delete will cascade and remove wishes automatically due to foreign key constraints
    const deleted = await database.deleteItem(itemId);
    if (!deleted) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ 
      message: 'Item and associated wishes deleted successfully',
      deletedItem: existingItem,
      removedWishes: wishesCount
    });
  } catch (error) {
    console.error('Force delete item error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/**
 * @swagger
 * /api/item/{id}/wish:
 *   get:
 *     summary: Get item wishers
 *     description: Get all characters who wish for this item
 *     tags: [Items]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Item ID
 *     responses:
 *       200:
 *         description: Item wishers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/Item'
 *                 wishes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       character:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           role:
 *                             type: string
 *                           dkp:
 *                             type: integer
 *                           user:
 *                             type: object
 *                             properties:
 *                               username:
 *                                 type: string
 *                               discordId:
 *                                 type: string
 *                 totalWishes:
 *                   type: integer
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/wish', authenticateToken, async (req: any, res) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    // Check if item exists
    const item = await database.getItemById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const wishes = await database.getItemWishes(itemId);

    res.json({
      item,
      wishes: wishes.map((wish: any) => ({
        character: {
          id: wish.character.id,
          name: wish.character.name,
          role: wish.character.role,
          dkp: wish.character.dkp,
          user: {
            username: wish.character.user.username,
            discordId: wish.character.user.discordId
          }
        }
      })),
      totalWishes: wishes.length
    });
  } catch (error) {
    console.error('Get item wishes error:', error);
    res.status(500).json({ error: 'Failed to fetch item wishes' });
  }
});

export default router;