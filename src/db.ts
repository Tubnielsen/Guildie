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
    class: string;
    level?: number;
    race?: string | null;
    background?: string | null;
    stats?: string | null;
    description?: string | null;
  }) {
    return await prisma.character.create({
      data: {
        userId: characterData.userId,
        name: characterData.name,
        class: characterData.class,
        level: characterData.level || 1,
        race: characterData.race,
        background: characterData.background,
        stats: characterData.stats,
        description: characterData.description,
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
    class?: string;
    level?: number;
    race?: string;
    background?: string;
    stats?: string;
    description?: string;
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
}

// Export singleton instance
export const database = new PrismaDatabase();