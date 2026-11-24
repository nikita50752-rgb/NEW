import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export type Regime = 'npd' | 'usn6' | 'usn15';
export type Status = 'self' | 'ip';

export interface Profile {
  regime: Regime;
  status: Status;
  fixedContributions: number;
}

export interface User {
  id: string;
  email: string;
  salt: string;
  passHash: string;
  createdAt: number;
  profile: Profile;
}

export type EntryType = 'income' | 'expense';
export type PayerType = 'person' | 'company';

export interface Entry {
  id: string;
  userId: string;
  type: EntryType;
  date: string;
  amount: number;
  payerType?: PayerType;
  method?: string;
  receipt?: string;
  category: string;
  note?: string;
  createdAt: number;
}

interface DB {
  users: User[];
  entries: Entry[];
}

let db: DB = { users: [], entries: [] };
let loaded = false;

export async function loadDB(): Promise<void> {
  if (loaded) return;
  try {
    db = JSON.parse(await readFile(DB_FILE, 'utf8')) as DB;
  } catch {
    db = { users: [], entries: [] };
  }
  loaded = true;
}

export async function saveDB(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

export function getDB(): DB {
  return db;
}
