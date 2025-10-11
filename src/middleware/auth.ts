import type { Request, Response, NextFunction } from 'express';
import { database } from '../db.js';

// Extend Express Request type to include user and session
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

// Base authentication middleware
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const result = await database.getUserWithSession(token);
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

// Authorization middleware factory
export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Specific role middleware
export const requireAdmin = requireRole(['ADMIN']);
export const requireOfficerOrAdmin = requireRole(['OFFICER', 'ADMIN']);
export const requireMemberOrHigher = requireRole(['MEMBER', 'OFFICER', 'ADMIN']);

// Ownership middleware - user can access their own resources
export const requireOwnershipOrAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admins can access anything
  if (req.user.role === 'ADMIN') {
    return next();
  }

  // For character routes, check if user owns the character
  if (req.params.characterId || req.body.characterId) {
    try {
      const characterId = parseInt(req.params.characterId || req.body.characterId);
      const character = await database.getCharacterById(characterId, req.user.id);
      
      if (!character) {
        return res.status(403).json({ error: 'Access denied: You can only modify your own characters' });
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid character ID' });
    }
  }

  next();
};

// Utility function to check if user has permission
export const hasPermission = (userRole: string, requiredRoles: string[]): boolean => {
  return requiredRoles.includes(userRole);
};

// Role hierarchy helper
export const getRoleLevel = (role: string): number => {
  switch (role) {
    case 'ADMIN': return 3;
    case 'OFFICER': return 2;
    case 'MEMBER': return 1;
    default: return 0;
  }
};

export const hasMinimumRole = (userRole: string, minimumRole: string): boolean => {
  return getRoleLevel(userRole) >= getRoleLevel(minimumRole);
};