// src/main/storage/database.ts

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export interface DownloadRecord {
  id: string;
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  cover: string;
  quality: number;
  file_path: string;
  file_size: number;
  status: string;
  created_at: string;
  completed_at: string;
}

export interface UserRecord {
  mid: number;
  name: string;
  face: string;
  cookie: string;
  vip_status: number;
  updated_at: string;
}

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'bilidownloader.db');

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      bvid TEXT NOT NULL,
      aid INTEGER NOT NULL,
      cid INTEGER NOT NULL,
      title TEXT,
      cover TEXT,
      quality INTEGER,
      file_path TEXT,
      file_size INTEGER,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS users (
      mid INTEGER PRIMARY KEY,
      name TEXT,
      face TEXT,
      cookie TEXT,
      vip_status INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY,
      title TEXT,
      count INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_bvid ON downloads(bvid);
    CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
  `);

  // Add aid column if not exists (for existing databases)
  try {
    db.prepare('ALTER TABLE downloads ADD COLUMN aid INTEGER').run();
  } catch (e) {
    // Column already exists, ignore
  }

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Download records
export function insertDownload(record: Omit<DownloadRecord, 'created_at' | 'completed_at'> & { completed_at?: string }): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO downloads 
    (id, bvid, aid, cid, title, cover, quality, file_path, file_size, status, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `);
  stmt.run(
    record.id,
    record.bvid,
    record.aid,
    record.cid,
    record.title,
    record.cover,
    record.quality,
    record.file_path,
    record.file_size,
    record.status,
    record.completed_at || null
  );
}

export function updateDownloadStatus(id: string, status: string, completedAt?: string): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE downloads 
    SET status = ?, completed_at = COALESCE(?, completed_at)
    WHERE id = ?
  `);
  stmt.run(status, completedAt || null, id);
}

export function getDownload(id: string): DownloadRecord | undefined {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM downloads WHERE id = ?');
  return stmt.get(id) as DownloadRecord | undefined;
}

export function getAllDownloads(): DownloadRecord[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM downloads ORDER BY created_at DESC');
  return stmt.all() as DownloadRecord[];
}

export function getDownloadsByStatus(status: string): DownloadRecord[] {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM downloads WHERE status = ? ORDER BY created_at DESC');
  return stmt.all(status) as DownloadRecord[];
}

export function deleteDownload(id: string): void {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM downloads WHERE id = ?');
  stmt.run(id);
}

// User records
export function upsertUser(record: Omit<UserRecord, 'updated_at'>): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO users 
    (mid, name, face, cookie, vip_status, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(record.mid, record.name, record.face, record.cookie, record.vip_status);
}

export function getUser(): UserRecord | undefined {
  const database = getDatabase();
  const stmt = database.prepare('SELECT * FROM users LIMIT 1');
  return stmt.get() as UserRecord | undefined;
}

export function deleteUser(): void {
  const database = getDatabase();
  const stmt = database.prepare('DELETE FROM users');
  stmt.run();
}
