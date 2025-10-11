import express from 'express';
import { database } from '../db.js';
import  {authenticateToken} from '../middleware/auth.js';
const router = express.Router();

/**
 * @swagger
 * /api/character:
 *   get:
 *     summary: Get user's characters
 *     description: Retrieve all characters owned by the authenticated user
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Characters retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characters:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Character'
 *                 count:
 *                   type: integer
 *                   description: Number of characters
 *                   example: 3
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Failed to fetch characters
 */
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    // You'll need to implement this in your database class
    const characters = await database.getCharactersByUserId(req.user.id);
    res.json({
      characters: characters,
      count: characters.length
    });
  } catch (error) {
    console.error('Get characters error:', error);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

/**
 * @swagger
 * /api/character/{id}:
 *   get:
 *     summary: Get character by ID
 *     description: Retrieve a specific character by ID (must be owned by user)
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Character ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Character found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 character:
 *                   $ref: '#/components/schemas/Character'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({ character });
  } catch (error) {
    console.error('Get character error:', error);
    res.status(500).json({ error: 'Failed to fetch character' });
  }
});

/**
 * @swagger
 * /api/character:
 *   post:
 *     summary: Create new character
 *     description: Create a new character for the authenticated user
 *     tags: [Characters]
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
 *                 example: "Dragonslayer"
 *               role:
 *                 type: string
 *                 enum: [DPS, TANK, HEALER]
 *                 nullable: true
 *                 example: "DPS"
 *               weapon1:
 *                 type: string
 *                 nullable: true
 *                 example: "Legendary Sword"
 *               weapon2:
 *                 type: string
 *                 nullable: true
 *                 example: "Magic Shield"
 *               combatPower:
 *                 type: integer
 *                 nullable: true
 *                 example: 1500
 *               gearImageUrl:
 *                 type: string
 *                 nullable: true
 *                 example: "https://example.com/gear.jpg"
 *               active:
 *                 type: string
 *                 enum: [ACTIVE, NOT_ACTIVE]
 *                 default: ACTIVE
 *               dkp:
 *                 type: integer
 *                 default: 0
 *                 example: 100
 *     responses:
 *       201:
 *         description: Character created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 character:
 *                   $ref: '#/components/schemas/Character'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { 
      name, 
      role, 
      weapon1, 
      weapon2, 
      combatPower, 
      gearImageUrl, 
      active, 
      dkp 
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    if (role && !['DPS', 'TANK', 'HEALER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be DPS, TANK, or HEALER' });
    }

    if (active && !['ACTIVE', 'NOT_ACTIVE'].includes(active)) {
      return res.status(400).json({ error: 'Active must be ACTIVE or NOT_ACTIVE' });
    }

    const characterData = {
      userId: req.user.id,
      name,
      role: role || null,
      weapon1: weapon1 || null,
      weapon2: weapon2 || null,
      combatPower: combatPower || null,
      gearImageUrl: gearImageUrl || null,
      active: active || 'ACTIVE',
      dkp: dkp || 0
    };

    const character = await database.createCharacter(characterData);
    
    res.status(201).json({
      message: 'Character created successfully',
      character
    });
  } catch (error) {
    console.error('Create character error:', error);
    res.status(500).json({ error: 'Failed to create character' });
  }
});

/**
 * @swagger
 * /api/character/{id}:
 *   put:
 *     summary: Update character
 *     description: Update an existing character (must be owned by user)
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Character ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [DPS, TANK, HEALER]
 *                 nullable: true
 *               weapon1:
 *                 type: string
 *                 nullable: true
 *               weapon2:
 *                 type: string
 *                 nullable: true
 *               combatPower:
 *                 type: integer
 *                 nullable: true
 *               gearImageUrl:
 *                 type: string
 *                 nullable: true
 *               active:
 *                 type: string
 *                 enum: [ACTIVE, NOT_ACTIVE]
 *               dkp:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Character updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 character:
 *                   $ref: '#/components/schemas/Character'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const { 
      name, 
      role, 
      weapon1, 
      weapon2, 
      combatPower, 
      gearImageUrl, 
      active, 
      dkp 
    } = req.body;

    // Validation
    if (name && name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    if (role && !['DPS', 'TANK', 'HEALER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be DPS, TANK, or HEALER' });
    }

    if (active && !['ACTIVE', 'NOT_ACTIVE'].includes(active)) {
      return res.status(400).json({ error: 'Active must be ACTIVE or NOT_ACTIVE' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (weapon1 !== undefined) updateData.weapon1 = weapon1;
    if (weapon2 !== undefined) updateData.weapon2 = weapon2;
    if (combatPower !== undefined) updateData.combatPower = combatPower;
    if (gearImageUrl !== undefined) updateData.gearImageUrl = gearImageUrl;
    if (active !== undefined) updateData.active = active;
    if (dkp !== undefined) updateData.dkp = dkp;

    const character = await database.updateCharacter(characterId, req.user.id, updateData);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({
      message: 'Character updated successfully',
      character
    });
  } catch (error) {
    console.error('Update character error:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

/**
 * @swagger
 * /api/character/{id}:
 *   delete:
 *     summary: Delete character
 *     description: Delete a character (must be owned by user)
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Character ID
 *     responses:
 *       200:
 *         description: Character deleted successfully
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
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const deleted = await database.deleteCharacter(characterId, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Delete character error:', error);
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

/**
 * @swagger
 * /api/character/{id}/dkp:
 *   put:
 *     summary: Update character DKP
 *     description: Update a character's DKP points (must be owned by user)
 *     tags: [Characters]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Character ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dkp
 *             properties:
 *               dkp:
 *                 type: integer
 *                 minimum: 0
 *                 example: 150
 *     responses:
 *       200:
 *         description: Character DKP updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 character:
 *                   $ref: '#/components/schemas/Character'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/:id/dkp', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const { dkp, operation } = req.body;
    if (dkp === undefined) {
      return res.status(400).json({ error: 'DKP amount is required' });
    }

    if (typeof dkp !== 'number') {
      return res.status(400).json({ error: 'DKP must be a number' });
    }

    // Get current character
    const currentCharacter = await database.getCharacterById(characterId, req.user.id);
    if (!currentCharacter) {
      return res.status(404).json({ error: 'Character not found' });
    }

    let newDkp;
    if (operation === 'add') {
      newDkp = currentCharacter.dkp + dkp;
    } else if (operation === 'subtract') {
      newDkp = Math.max(0, currentCharacter.dkp - dkp); // Don't allow negative DKP
    } else {
      newDkp = dkp; // Set absolute value
    }

    const character = await database.updateCharacter(characterId, req.user.id, {
      dkp: newDkp
    });

    res.json({
      message: 'Character DKP updated successfully',
      character,
      previousDkp: currentCharacter.dkp,
      newDkp: newDkp
    });
  } catch (error) {
    console.error('Update character DKP error:', error);
    res.status(500).json({ error: 'Failed to update character DKP' });
  }
});

export default router;