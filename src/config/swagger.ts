import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Guildie API',
    version: '1.0.0',
    description: 'A comprehensive guild management REST API with Discord authentication, character management, DKP tracking, and event attendance.',
    contact: {
      name: 'Guildie API Support',
      url: 'https://github.com/Tubnielsen/Guildie'
    },
    license: {
      name: 'Private License',
      url: 'https://github.com/Tubnielsen/Guildie/blob/main/LICENSE'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server'
    },
    {
      url: 'https://api.guildie.com',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your session token obtained from Discord OAuth'
      }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'User ID' },
          discordId: { type: 'string', description: 'Discord user ID' },
          username: { type: 'string', description: 'Discord username' },
          discriminator: { type: 'string', description: 'Discord discriminator' },
          avatar: { type: 'string', nullable: true, description: 'Discord avatar URL' },
          email: { type: 'string', nullable: true, description: 'Discord email' },
          role: { 
            type: 'string', 
            enum: ['MEMBER', 'OFFICER', 'ADMIN'], 
            description: 'User role in guild' 
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Character: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Character ID' },
          userId: { type: 'integer', description: 'Owner user ID' },
          name: { type: 'string', description: 'Character name' },
          role: { 
            type: 'string', 
            enum: ['DPS', 'TANK', 'HEALER'], 
            nullable: true,
            description: 'Character role' 
          },
          weapon1: { type: 'string', nullable: true, description: 'Primary weapon' },
          weapon2: { type: 'string', nullable: true, description: 'Secondary weapon' },
          combatPower: { type: 'integer', nullable: true, description: 'Character combat power' },
          gearImageUrl: { type: 'string', nullable: true, description: 'Gear screenshot URL' },
          active: { 
            type: 'string', 
            enum: ['ACTIVE', 'NOT_ACTIVE'],
            description: 'Character status' 
          },
          dkp: { type: 'integer', description: 'Dragon Kill Points' }
        }
      },
      Item: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Item ID' },
          name: { type: 'string', description: 'Item name' },
          imageUrl: { type: 'string', nullable: true, description: 'Item image URL' },
          minDkpCost: { type: 'integer', description: 'Minimum DKP cost' },
          wishesCount: { type: 'integer', description: 'Number of characters wanting this item' }
        }
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Event ID' },
          title: { type: 'string', description: 'Event title' },
          description: { type: 'string', nullable: true, description: 'Event description' },
          startTime: { type: 'string', format: 'date-time', description: 'Event start time' },
          endTime: { type: 'string', format: 'date-time', description: 'Event end time' },
          dkpReward: { type: 'integer', description: 'DKP reward for attendance' },
          attendanceCount: { type: 'integer', description: 'Number of attendees' }
        }
      },
      Attendance: {
        type: 'object',
        properties: {
          eventId: { type: 'integer', description: 'Event ID' },
          characterId: { type: 'integer', description: 'Character ID' },
          event: { $ref: '#/components/schemas/Event' },
          character: { $ref: '#/components/schemas/Character' }
        }
      },
      Wish: {
        type: 'object',
        properties: {
          characterId: { type: 'integer', description: 'Character ID' },
          itemId: { type: 'integer', description: 'Item ID' },
          character: { $ref: '#/components/schemas/Character' },
          item: { $ref: '#/components/schemas/Item' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' },
          details: { type: 'string', description: 'Detailed error information' }
        }
      },
      PaginationInfo: {
        type: 'object',
        properties: {
          currentPage: { type: 'integer' },
          totalPages: { type: 'integer' },
          totalItems: { type: 'integer' },
          itemsPerPage: { type: 'integer' },
          hasNextPage: { type: 'boolean' },
          hasPrevPage: { type: 'boolean' }
        }
      }
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication token is missing or invalid',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      ForbiddenError: {
        description: 'Insufficient permissions for this operation',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      },
      ValidationError: {
        description: 'Invalid input data',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' }
          }
        }
      }
    }
  },
  security: [
    {
      BearerAuth: []
    }
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'Discord OAuth2 authentication endpoints'
    },
    {
      name: 'Users',
      description: 'User profile and management'
    },
    {
      name: 'Characters',
      description: 'Character CRUD operations'
    },
    {
      name: 'Items',
      description: 'Item management (Admin/Officer only)'
    },
    {
      name: 'Events',
      description: 'Event scheduling and management'
    },
    {
      name: 'Attendance',
      description: 'Event attendance tracking'
    },
    {
      name: 'Wishes',
      description: 'Item wishlist system'
    },
    {
      name: 'Admin',
      description: 'Administrative operations'
    }
  ]
};

const options = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/*.ts',
    './src/index.ts'
  ]
};

export const swaggerSpec = swaggerJSDoc(options);