import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
const APPLICATION_ID = 0x494e4b4c;
export function defaultWorkspacePath() {
  return join(
    homedir(),
    'Library',
    'Application Support',
    'Inkling',
    'workspaces',
    'default',
  );
}
export class WorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${code}: ${message}`, options);
  }
}
function regular(path: string, directory = false) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return;
    throw error;
  }
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile())
  )
    throw new WorkspaceError(
      'WORKSPACE_PATH',
      '数据路径必须是普通本机目录或文件。',
    );
}
export class SqliteWorkspace {
  readonly id: string;
  private constructor(
    readonly path: string,
    private readonly db: Database.Database,
  ) {
    const row = db
      .prepare('SELECT workspace_id FROM workspace WHERE singleton=1')
      .get();
    if (
      !row ||
      typeof row !== 'object' ||
      !('workspace_id' in row) ||
      typeof row.workspace_id !== 'string'
    )
      throw new WorkspaceError('WORKSPACE_CORRUPT', '工作空间身份缺失。');
    this.id = row.workspace_id;
  }
  static open(requestedPath: string): SqliteWorkspace {
    if (!isAbsolute(requestedPath))
      throw new WorkspaceError('WORKSPACE_PATH', '工作空间需要绝对路径。');
    regular(requestedPath, true);
    mkdirSync(requestedPath, { recursive: true, mode: 0o700 });
    const path = realpathSync(requestedPath);
    chmodSync(path, 0o700);
    const file = join(path, 'inkling.sqlite');
    for (const suffix of ['', '-wal', '-shm', '-journal'])
      regular(file + suffix);
    const existed = existsSync(file);
    if (existed) {
      const fd = openSync(file, 'r');
      const header = Buffer.alloc(16);
      try {
        readSync(fd, header, 0, 16, 0);
      } finally {
        closeSync(fd);
      }
      if (header.toString() !== 'SQLite format 3\0')
        throw new WorkspaceError(
          'WORKSPACE_CORRUPT',
          '现有文件不是有效数据库，已保留原文件。',
        );
    }
    let db: Database.Database | undefined;
    try {
      db = new Database(file, { timeout: 1000 });
      chmodSync(file, 0o600);
      if (
        existed &&
        (db.pragma('user_version', { simple: true }) !== 1 ||
          db.pragma('application_id', { simple: true }) !== APPLICATION_ID)
      )
        throw new WorkspaceError(
          'WORKSPACE_VERSION',
          '数据库格式不兼容，拒绝修改。',
        );
      db.pragma('locking_mode=EXCLUSIVE');
      db.pragma('journal_mode=WAL');
      db.pragma('synchronous=FULL');
      db.pragma('fullfsync=ON');
      db.pragma('foreign_keys=ON');
      db.exec('BEGIN EXCLUSIVE; COMMIT;');
      for (const [name, expected] of Object.entries({
        locking_mode: 'exclusive',
        journal_mode: 'wal',
        synchronous: 2,
        fullfsync: 1,
        foreign_keys: 1,
      }))
        if (db.pragma(name, { simple: true }) !== expected)
          throw new WorkspaceError(
            'WORKSPACE_CONFIGURATION',
            `无法应用 ${name}。`,
          );
      if (!existed) {
        db.transaction(() => {
          db?.exec(
            `CREATE TABLE workspace(singleton INTEGER PRIMARY KEY CHECK(singleton=1),workspace_id TEXT NOT NULL UNIQUE,current_article_id TEXT,created_at INTEGER NOT NULL) STRICT;`,
          );
          db?.prepare('INSERT INTO workspace VALUES(1,?,NULL,?)').run(
            randomUUID(),
            Date.now(),
          );
          db?.pragma(`application_id=${APPLICATION_ID}`);
          db?.pragma('user_version=1');
        }).immediate();
      }
      const foreignErrors = db.pragma('foreign_key_check');
      if (
        db.pragma('quick_check', { simple: true }) !== 'ok' ||
        !Array.isArray(foreignErrors) ||
        foreignErrors.length > 0
      )
        throw new WorkspaceError('WORKSPACE_CORRUPT', '数据库完整性检查失败。');
      for (const suffix of ['', '-wal', '-shm'])
        if (existsSync(file + suffix)) chmodSync(file + suffix, 0o600);
      return new SqliteWorkspace(path, db);
    } catch (error) {
      db?.close();
      if (error instanceof WorkspaceError) throw error;
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'SQLITE_BUSY'
      )
        throw new WorkspaceError(
          'WORKSPACE_LOCKED',
          '工作空间已被另一个服务使用。',
          { cause: error },
        );
      throw new WorkspaceError(
        'WORKSPACE_UNAVAILABLE',
        '无法安全打开工作空间，原数据已保留。',
        { cause: error },
      );
    }
  }
  close() {
    this.db.close();
  }
}
