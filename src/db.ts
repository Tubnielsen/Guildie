import { PrismaClient } from '@prisma/client';

// Create a global variable to store the Prisma client in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Initialize Prisma client
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Prevent creating multiple instances in development
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Custom types for API responses
export type UserWithSessions = Awaited<ReturnType<typeof prisma.user.findUnique>> & {
  sessions: Awaited<ReturnType<typeof prisma.session.findMany>>;
};

export type CreateUserData = {
  discordId: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  email?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: bigint;
};

export type UpdateUserTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: bigint;
};

// Database operations class
export class PrismaDatabase {
  prisma: any;
  // User operations
  async createOrUpdateUser(discordUser: any, tokens: any) {
    const expiresAt = BigInt(Date.now() + (tokens.expires_in * 1000));
    
    return await prisma.user.upsert({
      where: { discordId: discordUser.id },
      update: {
        username: discordUser.username,
        discriminator: discordUser.discriminator || '0',
        avatar: discordUser.avatar,
        email: discordUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: expiresAt,
        updatedAt: new Date(),
      },
      create: {
        discordId: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator || '0',
        avatar: discordUser.avatar,
        email: discordUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: expiresAt,
      },
    });
  }

  async getUserByDiscordId(discordId: string) {
    return await prisma.user.findUnique({
      where: { discordId },
      include: { sessions: true },
    });
  }

  async getUserById(id: number) {
    return await prisma.user.findUnique({
      where: { id },
      include: { sessions: true },
    });
  }

  async updateUserTokens(userId: number, tokens: UpdateUserTokens) {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      },
    });
  }

  // Session operations
  async createSession(userId: number, sessionToken: string, expiresIn: number = 7 * 24 * 60 * 60 * 1000) {
    const expiresAt = BigInt(Date.now() + expiresIn);
    
    return await prisma.session.create({
      data: {
        userId,
        sessionToken,
        expiresAt,
      },
    });
  }

  async getSessionByToken(sessionToken: string) {
    const now = BigInt(Date.now());
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    // Check if session is expired
    if (session && session.expiresAt <= now) {
      return null;
    }
    return session;
  }

  async deleteSession(sessionToken: string) {
    return await prisma.session.delete({
      where: { sessionToken },
    });
  }

  async deleteExpiredSessions() {
    const now = BigInt(Date.now());
    return await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lte: now,
        },
      },
    });
  }

  async getUserWithSession(sessionToken: string) {
    const now = BigInt(Date.now());
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt <= now) {
      return null;
    }

    return {
      user: session.user,
      session: session,
    };
  }

  // Character operations
  async createCharacter(characterData: {
    userId: number;
    name: string;
    role?: 'DPS' | 'TANK' | 'HEALER' | null;
    weapon1?: string | null;
    weapon2?: string | null;
    combatPower?: number | null;
    gearImageUrl?: string | null;
    active?: 'ACTIVE' | 'NOT_ACTIVE';
    dkp?: number;
  }) {
    return await prisma.character.create({
      data: {
        userId: characterData.userId,
        name: characterData.name,
        role: characterData.role,
        weapon1: characterData.weapon1,
        weapon2: characterData.weapon2,
        combatPower: characterData.combatPower,
        gearImageUrl: characterData.gearImageUrl,
        active: characterData.active || 'ACTIVE',
        dkp: characterData.dkp || 0,
      },
    });
  }

  async getCharactersByUserId(userId: number) {
    return await prisma.character.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCharacterById(characterId: number, userId: number) {
    return await prisma.character.findFirst({
      where: {
        id: characterId,
        userId: userId, // Ensure user can only access their own characters
      },
    });
  }

  async updateCharacter(characterId: number, userId: number, updateData: {
    name?: string;
    role?: 'DPS' | 'TANK' | 'HEALER' | null;
    weapon1?: string | null;
    weapon2?: string | null;
    combatPower?: number | null;
    gearImageUrl?: string | null;
    active?: 'ACTIVE' | 'NOT_ACTIVE';
    dkp?: number;
  }) {
    return await prisma.character.updateMany({
      where: {
        id: characterId,
        userId: userId, // Ensure user can only update their own characters
      },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    }).then(async (result: any) => {
      if (result.count === 0) return null;
      return await this.getCharacterById(characterId, userId);
    });
  }

  async deleteCharacter(characterId: number, userId: number) {
    const result = await prisma.character.deleteMany({
      where: {
        id: characterId,
        userId: userId, // Ensure user can only delete their own characters
      },
    });
    return result.count > 0;
  }

  async getCharacterCount(userId?: number) {
    return await prisma.character.count({
      where: userId ? { userId } : undefined,
    });
  }

  // Item operations
  async createItem(itemData: {
    name: string;
    imageUrl?: string | null;
    minDkpCost?: number;
  }) {
    return await prisma.item.create({
      data: {
        name: itemData.name,
        imageUrl: itemData.imageUrl,
        minDkpCost: itemData.minDkpCost || 1,
      },
    });
  }

  async getItems(options?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }) {
    return await prisma.item.findMany({
      skip: options?.skip,
      take: options?.take,
      where: options?.where,
      orderBy: options?.orderBy,
    });
  }

  async getItemById(itemId: number) {
    return await prisma.item.findUnique({
      where: { id: itemId },
    });
  }

  async getItemByName(name: string) {
    return await prisma.item.findUnique({
      where: { name },
    });
  }

  async updateItem(itemId: number, updateData: {
    name?: string;
    imageUrl?: string | null;
    minDkpCost?: number;
  }) {
    return await prisma.item.update({
      where: { id: itemId },
      data: updateData,
    });
  }

  async deleteItem(itemId: number) {
    try {
      await prisma.item.delete({
        where: { id: itemId },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getItemCount(filters?: any) {
    return await prisma.item.count({
      where: filters,
    });
  }

  async getItemWishesCount(itemId: number) {
    return await prisma.wish.count({
      where: { itemId },
    });
  }

  async getItemWishes(itemId: number) {
    return await prisma.wish.findMany({
      where: { itemId },
      include: {
        character: {
          include: {
            user: {
              select: {
                username: true,
                discordId: true,
              },
            },
          },
        },
      },
    });
  }

  // Wish operations
  async createWish(characterId: number, itemId: number) {
    return await prisma.wish.create({
      data: {
        characterId,
        itemId,
      },
    });
  }

  async deleteWish(characterId: number, itemId: number) {
    try {
      await prisma.wish.delete({
        where: {
          characterId_itemId: {
            characterId,
            itemId,
          },
        },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getCharacterWishes(characterId: number) {
    return await prisma.wish.findMany({
      where: { characterId },
      include: {
        item: true,
      },
    });
  }

  async checkWishExists(characterId: number, itemId: number) {
    const wish = await prisma.wish.findUnique({
      where: {
        characterId_itemId: {
          characterId,
          itemId,
        },
      },
    });
    return !!wish;
  }

  async getWishes(options?: {
    skip?: number;
    take?: number;
    where?: any;
    include?: any;
    orderBy?: any;
  }) {
    return await prisma.wish.findMany({
      skip: options?.skip,
      take: options?.take,
      where: options?.where,
      include: options?.include,
      orderBy: options?.orderBy,
    });
  }

  async getWishesCount(filters?: any) {
    return await prisma.wish.count({
      where: filters,
    });
  }

  async deleteAllCharacterWishes(characterId: number) {
    return await prisma.wish.deleteMany({
      where: { characterId },
    });
  }

  async getUserWishesCount(userId: number) {
    return await prisma.wish.count({
      where: {
        character: {
          userId: userId,
        },
      },
    });
  }

  async getMostWishedItems(limit: number = 10) {
    return await prisma.item.findMany({
      include: {
        _count: {
          select: {
            wishes: true,
          },
        },
      },
      orderBy: {
        wishes: {
          _count: 'desc',
        },
      },
      take: limit,
    });
  }

  // Event operations
  async createEvent(eventData: {
    title: string;
    description?: string | null;
    startTime: Date;
    endTime: Date;
    dkpReward?: number;
  }) {
    return await prisma.event.create({
      data: {
        title: eventData.title,
        description: eventData.description,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        dkpReward: eventData.dkpReward || 0,
      },
    });
  }

  async getEvents(options?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }) {
    return await prisma.event.findMany({
      skip: options?.skip,
      take: options?.take,
      where: options?.where,
      orderBy: options?.orderBy,
      include: {
        attendances: {
          include: {
            character: {
              include: {
                user: {
                  select: {
                    username: true,
                    discordId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getEventById(eventId: number) {
    return await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        attendances: {
          include: {
            character: {
              include: {
                user: {
                  select: {
                    username: true,
                    discordId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async updateEvent(eventId: number, updateData: {
    title?: string;
    description?: string | null;
    startTime?: Date;
    endTime?: Date;
    dkpReward?: number;
  }) {
    return await prisma.event.update({
      where: { id: eventId },
      data: updateData,
    });
  }

  async deleteEvent(eventId: number) {
    try {
      await prisma.event.delete({
        where: { id: eventId },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getEventCount(filters?: any) {
    return await prisma.event.count({
      where: filters,
    });
  }

  // Attendance operations
  async addAttendance(eventId: number, characterId: number) {
    return await prisma.attendance.create({
      data: {
        eventId,
        characterId,
      },
    });
  }

  async removeAttendance(eventId: number, characterId: number) {
    try {
      await prisma.attendance.delete({
        where: {
          eventId_characterId: {
            eventId,
            characterId,
          },
        },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getEventAttendances(eventId: number) {
    return await prisma.attendance.findMany({
      where: { eventId },
      include: {
        character: {
          include: {
            user: {
              select: {
                username: true,
                discordId: true,
              },
            },
          },
        },
      },
    });
  }

  async getCharacterAttendances(characterId: number) {
    return await prisma.attendance.findMany({
      where: { characterId },
      include: {
        event: true,
      },
    });
  }

  // Extended attendance operations
  async getAttendances(options?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
    include?: any;
  }) {
    return await prisma.attendance.findMany({
      skip: options?.skip,
      take: options?.take,
      where: options?.where,
      orderBy: options?.orderBy,
      include: options?.include,
    });
  }

  async getAttendanceCount(filters?: any) {
    return await prisma.attendance.count({
      where: filters,
    });
  }

  async checkAttendanceExists(eventId: number, characterId: number) {
    const attendance = await prisma.attendance.findUnique({
      where: {
        eventId_characterId: {
          eventId,
          characterId,
        },
      },
    });
    return !!attendance;
  }

  async updateCharacterDkp(characterId: number, dkpChange: number) {
    return await prisma.character.update({
      where: { id: characterId },
      data: {
        dkp: {
          increment: dkpChange,
        },
      },
    });
  }

  async getCharacterByIdAdmin(characterId: number) {
    return await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discordId: true,
          },
        },
      },
    });
  }

  async getUniqueEventCount(attendanceFilters?: any) {
    const result = await prisma.attendance.findMany({
      where: attendanceFilters,
      select: { eventId: true },
      distinct: ['eventId'],
    });
    return result.length;
  }

  async getUniqueCharacterCount(attendanceFilters?: any) {
    const result = await prisma.attendance.findMany({
      where: attendanceFilters,
      select: { characterId: true },
      distinct: ['characterId'],
    });
    return result.length;
  }

  async getTopAttenders(limit: number = 10, attendanceFilters?: any) {
    const attendances = await prisma.attendance.groupBy({
      by: ['characterId'],
      where: attendanceFilters,
      _count: {
        eventId: true,
      },
      orderBy: {
        _count: {
          eventId: 'desc',
        },
      },
      take: limit,
    });

    // Get character details for top attenders
    const topAttendersWithDetails = await Promise.all(
      attendances.map(async (attendance) => {
        const character = await this.getCharacterByIdAdmin(attendance.characterId);
        return {
          character: character ? {
            id: character.id,
            name: character.name,
            role: character.role,
            dkp: character.dkp,
            user: character.user,
          } : null,
          attendanceCount: attendance._count.eventId,
        };
      })
    );

    return topAttendersWithDetails.filter(item => item.character !== null);
  }

  // Utility methods
  async getUserCount() {
    return await prisma.user.count();
  }

  async getActiveSessionCount() {
    const now = BigInt(Date.now());
    return await prisma.session.count({
      where: {
        expiresAt: {
          gt: now,
        },
      },
    });
  }

  // Role management operations
  async updateUserRole(userId: number, role: 'MEMBER' | 'OFFICER' | 'ADMIN') {
    return await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  async getUsersByRole(role: 'MEMBER' | 'OFFICER' | 'ADMIN') {
    return await prisma.user.findMany({
      where: { role },
      select: {
        id: true,
        username: true,
        discordId: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async promoteUser(userId: number) {
    const user = await this.getUserById(userId);
    if (!user) return null;

    let newRole: 'MEMBER' | 'OFFICER' | 'ADMIN';
    switch (user.role) {
      case 'MEMBER':
        newRole = 'OFFICER';
        break;
      case 'OFFICER':
        newRole = 'ADMIN';
        break;
      default:
        return null; // Already admin or invalid role
    }

    return await this.updateUserRole(userId, newRole);
  }

  async demoteUser(userId: number) {
    const user = await this.getUserById(userId);
    if (!user) return null;

    let newRole: 'MEMBER' | 'OFFICER' | 'ADMIN';
    switch (user.role) {
      case 'ADMIN':
        newRole = 'OFFICER';
        break;
      case 'OFFICER':
        newRole = 'MEMBER';
        break;
      default:
        return null; // Already member or invalid role
    }

    return await this.updateUserRole(userId, newRole);
  }
}

// Export singleton instance
export const database = new PrismaDatabase();