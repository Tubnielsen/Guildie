import express from 'express';
import { database } from '../db.js';
import  {authenticateToken} from '../index.js';
const router = express.Router();

// GET /api/characters - Get all characters for the authenticated user
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

// GET /api/characters/:id - Get a specific character by ID
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

// POST /api/characters - Create a new character
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { name, class: characterClass, level, race, background, stats, description } = req.body;

    // Validation
    if (!name || !characterClass) {
      return res.status(400).json({ error: 'Name and class are required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    const characterData = {
      userId: req.user.id,
      name,
      class: characterClass,
      level: level || 1,
      race: race || null,
      background: background || null,
      stats: stats ? JSON.stringify(stats) : null,
      description: description || null
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

// PUT /api/characters/:id - Update a character
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const { name, class: characterClass, level, race, background, stats, description } = req.body;

    // Validation
    if (name && name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (characterClass !== undefined) updateData.class = characterClass;
    if (level !== undefined) updateData.level = level;
    if (race !== undefined) updateData.race = race;
    if (background !== undefined) updateData.background = background;
    if (stats !== undefined) updateData.stats = JSON.stringify(stats);
    if (description !== undefined) updateData.description = description;

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

// DELETE /api/characters/:id - Delete a character
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

// GET /api/characters/:id/stats - Get character stats (if stored separately)
router.get('/:id/stats', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const character = await database.getCharacterById(characterId, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const stats = character.stats ? JSON.parse(character.stats) : null;
    res.json({ stats });
  } catch (error) {
    console.error('Get character stats error:', error);
    res.status(500).json({ error: 'Failed to fetch character stats' });
  }
});

// PUT /api/characters/:id/stats - Update character stats
router.put('/:id/stats', authenticateToken, async (req: any, res) => {
  try {
    const characterId = parseInt(req.params.id);
    if (isNaN(characterId)) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }

    const { stats } = req.body;
    if (!stats) {
      return res.status(400).json({ error: 'Stats data is required' });
    }

    const character = await database.updateCharacter(characterId, req.user.id, {
      stats: JSON.stringify(stats)
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({
      message: 'Character stats updated successfully',
      stats: JSON.parse(character.stats || '{}')
    });
  } catch (error) {
    console.error('Update character stats error:', error);
    res.status(500).json({ error: 'Failed to update character stats' });
  }
});

export default router;