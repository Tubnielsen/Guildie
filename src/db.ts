import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';

export interface User {
  id: number;
  discord_id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  user_id: number;
  session_token: string;
  expires_at: number;
  created_at: string;
}

class DatabaseManager {
  private db: Database;

  constructor() {
    const dbPath = path.join(__dirname, '../database.sqlite');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
    // Users table for storing Discord user data
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        discriminator TEXT NOT NULL,
        avatar TEXT,
        email TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sessions table for managing user sessions
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.run('CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  }

  // User operations
  async createOrUpdateUser(discordUser: any, tokens: any): Promise<User> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO users 
        (discord_id, username, discriminator, avatar, email, access_token, refresh_token, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const params = [
        discordUser.id,
        discordUser.username,
        discordUser.discriminator || '0',
        discordUser.avatar,
        discordUser.email,
        tokens.access_token,
        tokens.refresh_token,
        Date.now() + (tokens.expires_in * 1000)
      ];

      this.db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          // Fetch the created/updated user
          const selectSql = 'SELECT * FROM users WHERE discord_id = ?';
          this.db.get(selectSql, [discordUser.id], (err: any, row: any) => {
            if (err) reject(err);
            else resolve(row as User);
          });
        }
      });
    });
  }

  async getUserByDiscordId(discordId: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM users WHERE discord_id = ?';
      this.db.get(sql, [discordId], (err, row) => {
        if (err) reject(err);
        else resolve(row as User || null);
      });
    });
  }

  async getUserById(id: number): Promise<User | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      this.db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row as User || null);
      });
    });
  }

  async updateUserTokens(userId: number, tokens: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE users 
        SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        tokens.access_token,
        tokens.refresh_token,
        Date.now() + (tokens.expires_in * 1000),
        userId
      ];

      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Session operations
  async createSession(userId: number, sessionToken: string, expiresIn: number = 7 * 24 * 60 * 60 * 1000): Promise<Session> {
    return new Promise((resolve, reject) => {
      const expiresAt = Date.now() + expiresIn;
      const sql = `
        INSERT INTO sessions (user_id, session_token, expires_at)
        VALUES (?, ?, ?)
      `;

      this.db.run(sql, [userId, sessionToken, expiresAt], (err) => {
        if (err) {
          reject(err);
        } else {
          const selectSql = 'SELECT * FROM sessions WHERE session_token = ?';
          this.db.get(selectSql, [sessionToken], (err: any, row: any) => {
            if (err) reject(err);
            else resolve(row as Session);
          });
        }
      });
    });
  }

  async getSessionByToken(sessionToken: string): Promise<Session | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM sessions WHERE session_token = ? AND expires_at > ?';
      this.db.get(sql, [sessionToken, Date.now()], (err, row) => {
        if (err) reject(err);
        else resolve(row as Session || null);
      });
    });
  }

  async deleteSession(sessionToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM sessions WHERE session_token = ?';
      this.db.run(sql, [sessionToken], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteExpiredSessions(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM sessions WHERE expires_at <= ?';
      this.db.run(sql, [Date.now()], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getUserWithSession(sessionToken: string): Promise<{ user: User; session: Session } | null> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT u.*, s.id as session_id, s.session_token, s.expires_at as session_expires_at
        FROM users u
        JOIN sessions s ON u.id = s.user_id
        WHERE s.session_token = ? AND s.expires_at > ?
      `;
      
      this.db.get(sql, [sessionToken, Date.now()], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          const user: User = {
            id: row.id,
            discord_id: row.discord_id,
            username: row.username,
            discriminator: row.discriminator,
            avatar: row.avatar,
            email: row.email,
            access_token: row.access_token,
            refresh_token: row.refresh_token,
            expires_at: row.expires_at,
            created_at: row.created_at,
            updated_at: row.updated_at
          };
          
          const session: Session = {
            id: row.session_id,
            user_id: row.id,
            session_token: row.session_token,
            expires_at: row.session_expires_at,
            created_at: row.created_at
          };
          
          resolve({ user, session });
        }
      });
    });
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

// Create and export a singleton instance
const db = new DatabaseManager();
export default db;

// Clean up expired sessions every hour
setInterval(() => {
  db.deleteExpiredSessions().catch(console.error);
}, 60 * 60 * 1000);