import crypto from "crypto";
import fs from "fs";
import path from "path";

import { getUserDataDir } from "./publicationsConfig";
import { getUserDir } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./jsonStore";
import { getAvatarPath } from "./avatarStorage";

// CLAUDE-ADDED: Bootstrap admin keeps the same id the app used back when there was only ever one
// hardcoded user ("DT") -- every existing on-disk positions/highlights/settings file for that user
// lives under userData/DT/, so the migration below must never change this id or it'd orphan all of
// it.
const BOOTSTRAP_ADMIN_ID = "DT";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = "ishi_session";

// CLAUDE-ADDED: Secure-by-default (browsers silently drop a Secure cookie set over plain HTTP, which
// otherwise looks exactly like "login succeeds but you're immediately bounced back to /login" --
// the session really was created, the cookie just never got stored). ISHI_INSECURE_COOKIES is an
// explicit opt-out for LAN-only/plain-HTTP deployments (e.g. a Docker container reached by raw IP
// with no TLS-terminating reverse proxy in front of it) that still want NODE_ENV=production's other
// behavior. Leave unset for anything reachable over the open internet.
export const SESSION_COOKIE_SECURE =
  process.env.NODE_ENV === "production" && process.env.ISHI_INSECURE_COOKIES !== "true";

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  isAdmin: boolean;
  avatarExt: string | null;
  passwordHash: string | null;
  passwordSalt: string | null;
  failedAttempts: number;
  lockedUntil: number | null;
  createdAt: number;
  disabled: boolean;
}

export type PublicUser = Pick<UserRecord, "id" | "username" | "name" | "isAdmin"> & {
  avatarUrl: string | null;
  needsPasswordSetup: boolean;
};

export interface LoginResult {
  ok: boolean;
  error?: string;
  lockedUntil?: number;
  needsPasswordSetup?: boolean;
  userId?: string;
}

function getUsersRegistryPath(): string {
  return path.join(getUserDataDir(), "users.json");
}

function getSessionsPath(): string {
  return path.join(getUserDataDir(), "sessions.json");
}

// CLAUDE-ADDED: mtime-checked cache, NOT a plain "write updates the cache" cache -- proxy.ts (Next's
// Proxy/Middleware) is bundled as its own separate module graph from the API route handlers, so even
// though both run in the same Node.js process, each gets its OWN copy of this module and therefore
// its own independent `usersCache` variable. A plain forever-cache broke logins entirely: the login
// route's module instance would write a new session/user and update *its own* cache, but proxy.ts's
// already-warmed cache would never see it and would keep rejecting the new session forever (until
// the dev server restarted) -- reproduced live: after the very first request through proxy.ts, every
// subsequent login created a real session on disk that proxy.ts never recognized, bouncing the user
// straight back to /login. Checking the file's mtime is a cheap `fs.statSync` (no parse) on every
// call; only a *changed* mtime triggers an actual re-read+parse, so a burst of concurrent requests
// within the same tick (the original problem this cache was added for -- one request per book's
// reading position on library load) still only pays for one real read, while a write from any other
// module instance is picked up on the very next call instead of never.
let usersCache: UserRecord[] | null = null;
let usersCacheMtimeMs: number | null = null;

function readUsers(): UserRecord[] {
  const registryPath = getUsersRegistryPath();

  let currentMtimeMs: number | null;
  try {
    currentMtimeMs = fs.statSync(registryPath).mtimeMs;
  } catch {
    currentMtimeMs = null;
  }

  if (usersCache === null || currentMtimeMs !== usersCacheMtimeMs) {
    // CLAUDE-ADDED: readJsonFile rethrows on anything other than ENOENT (a corrupt/mid-write file,
    // for instance), which is the right call for most callers -- but this one runs inside proxy.ts
    // on every single request, and an uncaught throw there is far less forgiving than one inside a
    // route handler. Degrading to "no users" on a bad read is the safe failure mode (locks everyone
    // out until the file is fixed, never grants access it shouldn't) instead of taking the whole
    // server down.
    try {
      usersCache = readJsonFile<UserRecord[]>(registryPath) ?? [];
      usersCacheMtimeMs = currentMtimeMs;
    } catch (err) {
      console.error("Failed to read users registry -- treating as empty for this request:", err);
      return [];
    }
  }
  return usersCache;
}

function writeUsers(users: UserRecord[]): void {
  writeJsonFileAtomic(getUsersRegistryPath(), users);
  usersCache = users;
  try {
    usersCacheMtimeMs = fs.statSync(getUsersRegistryPath()).mtimeMs;
  } catch {
    usersCacheMtimeMs = null;
  }
}

// CLAUDE-ADDED: Creates the registry on a fresh install, and backfills any legacy row (the old
// `[{ id, name }]` shape, from before there was a login system at all) with the new fields --
// admin, no password yet (forces the "set your password" flow on first login instead of shipping
// a default password), never locked out.
export function ensureUsersRegistry(): void {
  const registryPath = getUsersRegistryPath();
  const existing = readJsonFile<Partial<UserRecord>[]>(registryPath);

  if (!existing || existing.length === 0) {
    writeUsers([{
      id: BOOTSTRAP_ADMIN_ID,
      username: BOOTSTRAP_ADMIN_ID,
      name: "DT",
      isAdmin: true,
      avatarExt: null,
      passwordHash: null,
      passwordSalt: null,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: Date.now(),
      disabled: false
    }]);
    return;
  }

  let changed = false;
  const migrated = existing.map((u): UserRecord => {
    if (
      typeof u.username === "string" &&
      typeof u.isAdmin === "boolean" &&
      "avatarExt" in u &&
      "passwordHash" in u &&
      "disabled" in u
    ) {
      return u as UserRecord;
    }

    changed = true;
    return {
      id: u.id!,
      username: u.username ?? u.id!,
      name: u.name ?? u.id!,
      isAdmin: u.isAdmin ?? false,
      avatarExt: u.avatarExt ?? null,
      passwordHash: u.passwordHash ?? null,
      passwordSalt: u.passwordSalt ?? null,
      failedAttempts: u.failedAttempts ?? 0,
      lockedUntil: u.lockedUntil ?? null,
      createdAt: u.createdAt ?? Date.now(),
      disabled: u.disabled ?? false
    };
  });

  if (changed) writeUsers(migrated);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function getUserById(id: string): UserRecord | null {
  ensureUsersRegistry();
  return readUsers().find((u) => u.id === id) ?? null;
}

export function getUserByUsername(username: string): UserRecord | null {
  ensureUsersRegistry();
  const needle = username.trim().toLowerCase();
  return readUsers().find((u) => u.username.toLowerCase() === needle) ?? null;
}

// CLAUDE-ADDED: The avatar URL's path never changes across re-uploads (same id, same route), so
// without a cache-busting query param the browser keeps serving the previously-cached image bytes
// after a user replaces their picture -- looks exactly like the upload silently did nothing. The
// upload response already appended Date.now() for this reason, but this is the copy actually shown
// everywhere else (edit dialog, login picker, admin panel) once the page re-fetches /api/auth/me --
// stamping it with the avatar file's own mtime keeps it correct there too, and for free on any other
// page load, without persisting a separate "version" field.
function getAvatarVersion(userId: string, ext: string): number {
  try {
    return fs.statSync(getAvatarPath(userId, ext)).mtimeMs;
  } catch {
    return 0;
  }
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    isAdmin: user.isAdmin,
    avatarUrl: user.avatarExt ? `/api/users/${ user.id }/avatar?v=${ getAvatarVersion(user.id, user.avatarExt) }` : null,
    needsPasswordSetup: !user.passwordHash
  };
}

export function listUsers(): UserRecord[] {
  ensureUsersRegistry();
  return readUsers();
}

// CLAUDE-ADDED: Jellyfin-style lockout -- N wrong passwords locks the account for a cooldown,
// independent of whether the submitted password was "close". A user that doesn't exist runs the
// same scrypt cost as a real failed attempt (against a fixed dummy salt) so response timing can't
// be used to enumerate valid usernames, and the error message is identical either way.
const DUMMY_SALT = "0".repeat(32);

export function attemptLogin(username: string, password: string): LoginResult {
  const user = getUserByUsername(username);

  if (!user) {
    hashPassword(password, DUMMY_SALT);
    return { ok: false, error: "Invalid username or password" };
  }

  // CLAUDE-ADDED: Checked before lockout/password verification -- a disabled account can't sign in
  // at all, regardless of whether the password would've been correct. Sessions are also destroyed
  // the moment an admin flips this flag (see updateUser), so this mainly guards direct hits to this
  // route/API rather than a still-logged-in browser tab.
  if (user.disabled) {
    return { ok: false, error: "This account has been disabled." };
  }

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, error: "Account locked due to too many failed attempts. Try again later.", lockedUntil: user.lockedUntil };
  }

  if (!user.passwordHash || !user.passwordSalt) {
    // CLAUDE-ADDED: An account with no password yet can be signed into directly by leaving the
    // password field blank -- typing something instead routes to the setup-password flow, letting
    // that typed value become the account's first password. Blank-password sign-in never applies
    // once a real password is set (the branch above only reaches here when passwordHash is null).
    if (password === "") return { ok: true, userId: user.id };
    return { ok: false, needsPasswordSetup: true, userId: user.id };
  }

  const users = readUsers();
  const target = users.find((u) => u.id === user.id)!;
  const valid = verifyPassword(password, target.passwordSalt!, target.passwordHash!);

  if (!valid) {
    target.failedAttempts += 1;
    if (target.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      target.lockedUntil = now + LOCKOUT_DURATION_MS;
      target.failedAttempts = 0;
    }
    writeUsers(users);
    return { ok: false, error: "Invalid username or password" };
  }

  target.failedAttempts = 0;
  target.lockedUntil = null;
  writeUsers(users);
  return { ok: true, userId: target.id };
}

// CLAUDE-ADDED: Only usable while the account has no password yet -- the login route routes here
// instead of attemptLogin whenever needsPasswordSetup came back true. Once set, this same account
// goes through attemptLogin like any other from then on.
export function setInitialPassword(userId: string, newPassword: string): void {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");
  if (user.passwordHash) throw new Error("Password already set");

  const salt = crypto.randomBytes(16).toString("hex");
  user.passwordHash = hashPassword(newPassword, salt);
  user.passwordSalt = salt;
  writeUsers(users);
}

export function changePassword(userId: string, currentPassword: string, newPassword: string): { ok: boolean; error?: string } {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return { ok: false, error: "User not found" };

  if (user.passwordHash && user.passwordSalt) {
    if (!verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      return { ok: false, error: "Current password is incorrect" };
    }
  }

  const salt = crypto.randomBytes(16).toString("hex");
  user.passwordHash = hashPassword(newPassword, salt);
  user.passwordSalt = salt;
  writeUsers(users);
  return { ok: true };
}

// CLAUDE-ADDED: Admin-only reset -- unlike changePassword, doesn't require knowing the old one.
export function adminResetPassword(userId: string, newPassword: string): void {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");

  const salt = crypto.randomBytes(16).toString("hex");
  user.passwordHash = hashPassword(newPassword, salt);
  user.passwordSalt = salt;
  user.failedAttempts = 0;
  user.lockedUntil = null;
  writeUsers(users);
  destroyAllSessionsForUser(userId);
}

export function unlockUser(userId: string): void {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");
  user.failedAttempts = 0;
  user.lockedUntil = null;
  writeUsers(users);
}

export function isUsernameTaken(username: string, excludeId?: string): boolean {
  const needle = username.trim().toLowerCase();
  return readUsers().some((u) => u.id !== excludeId && u.username.toLowerCase() === needle);
}

// CLAUDE-ADDED: `password` is optional -- an admin can create a passwordless profile (e.g. a quick
// household profile with no login barrier) the same way the bootstrap admin starts out passwordless.
// Anyone can sign into a passwordless account by leaving the password field blank on /login (see
// attemptLogin above); typing something there instead routes through the same needsPasswordSetup
// flow bootstrap accounts use, letting that value become the account's first password.
export function createUser(input: { username: string; name: string; password?: string; isAdmin: boolean }): UserRecord {
  ensureUsersRegistry();
  if (isUsernameTaken(input.username)) throw new Error("Username is already taken");

  const users = readUsers();
  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;
  if (input.password) {
    passwordSalt = crypto.randomBytes(16).toString("hex");
    passwordHash = hashPassword(input.password, passwordSalt);
  }

  const user: UserRecord = {
    id: crypto.randomUUID(),
    username: input.username.trim(),
    name: input.name.trim() || input.username.trim(),
    isAdmin: input.isAdmin,
    avatarExt: null,
    passwordHash,
    passwordSalt,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: Date.now(),
    disabled: false
  };

  users.push(user);
  writeUsers(users);
  return user;
}

export function updateUser(userId: string, patch: { username?: string; name?: string; isAdmin?: boolean; disabled?: boolean }): UserRecord {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");

  if (patch.username !== undefined) {
    if (isUsernameTaken(patch.username, userId)) throw new Error("Username is already taken");
    user.username = patch.username.trim();
  }
  if (patch.name !== undefined) user.name = patch.name.trim() || user.username;
  if (patch.isAdmin !== undefined) {
    if (!patch.isAdmin && user.isAdmin && countEnabledAdmins(users) <= 1) {
      throw new Error("Can't remove the last remaining admin");
    }
    // CLAUDE-ADDED: Same reasoning as createUser's admin-requires-a-password rule -- a passwordless
    // admin account could be claimed by anyone leaving the password field blank on /login.
    if (patch.isAdmin && !user.passwordHash) {
      throw new Error("Set a password for this user before making them an admin");
    }
    user.isAdmin = patch.isAdmin;
  }
  if (patch.disabled !== undefined) {
    // CLAUDE-ADDED: Mirrors the last-admin guard above -- otherwise an admin could disable every
    // other admin account (or their own, via a non-UI request) and lock the panel forever.
    if (patch.disabled && user.isAdmin && countEnabledAdmins(users) <= 1) {
      throw new Error("Can't disable the last remaining admin");
    }
    user.disabled = patch.disabled;
    // CLAUDE-ADDED: Disabling kicks the account out immediately rather than waiting for their
    // session to expire (up to 30 days) -- same "resistant to breaches" bar as adminResetPassword's
    // destroyAllSessionsForUser call.
    if (patch.disabled) destroyAllSessionsForUser(userId);
  }

  writeUsers(users);
  return user;
}

function countAdmins(users: UserRecord[]): number {
  return users.filter((u) => u.isAdmin).length;
}

function countEnabledAdmins(users: UserRecord[]): number {
  return users.filter((u) => u.isAdmin && !u.disabled).length;
}

export function deleteUser(userId: string): void {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");
  if (user.isAdmin && countAdmins(users) <= 1) {
    throw new Error("Can't delete the last remaining admin");
  }

  writeUsers(users.filter((u) => u.id !== userId));
  destroyAllSessionsForUser(userId);

  // CLAUDE-ADDED: Removes the deleted user's whole data directory (avatar, positions, highlights,
  // settings, etc.) -- without this, deleting an account from the admin panel would silently leave
  // an orphaned directory (keyed by an id no longer in the registry) behind forever.
  fs.rmSync(getUserDir(userId), { recursive: true, force: true });
}

export function setAvatar(userId: string, ext: string | null): void {
  const users = readUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error("User not found");
  user.avatarExt = ext;
  writeUsers(users);
}

// --- Sessions --------------------------------------------------------------

interface SessionRecord {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

type SessionsMap = Record<string, SessionRecord>;

// CLAUDE-ADDED: Same mtime-checked cache as usersCache above (see the comment there for why a plain
// forever-cache is wrong -- proxy.ts is a separate module instance from the route handlers, so a
// write in one is invisible to the other's cache without checking the file itself). This is the
// hottest path in the whole auth layer (every request, at least twice: once in proxy.ts, once in the
// calling route), and it's also the one where staleness is most user-visible -- a stale cache here
// doesn't just mean slightly-old data, it means a freshly created session is invisible to proxy.ts
// and the user gets bounced straight back to /login right after a successful login.
let sessionsCache: SessionsMap | null = null;
let sessionsCacheMtimeMs: number | null = null;

function readSessions(): SessionsMap {
  const sessionsPath = getSessionsPath();

  let currentMtimeMs: number | null;
  try {
    currentMtimeMs = fs.statSync(sessionsPath).mtimeMs;
  } catch {
    currentMtimeMs = null;
  }

  if (sessionsCache === null || currentMtimeMs !== sessionsCacheMtimeMs) {
    // CLAUDE-ADDED: Same reasoning as readUsers' try/catch -- this runs inside proxy.ts on every
    // single request, so a corrupt/mid-write sessions.json throwing here would take down the whole
    // server instead of just failing the one request. Degrading to "no sessions" just signs everyone
    // out until the file is fixed, which is the safe failure mode.
    try {
      sessionsCache = readJsonFile<SessionsMap>(sessionsPath) ?? {};
      sessionsCacheMtimeMs = currentMtimeMs;
    } catch (err) {
      console.error("Failed to read sessions store -- treating as empty for this request:", err);
      return {};
    }
  }
  return sessionsCache;
}

function writeSessions(sessions: SessionsMap): void {
  writeJsonFileAtomic(getSessionsPath(), sessions);
  sessionsCache = sessions;
  try {
    sessionsCacheMtimeMs = fs.statSync(getSessionsPath()).mtimeMs;
  } catch {
    sessionsCacheMtimeMs = null;
  }
}

export function createSession(userId: string): string {
  const sessions = readSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_DURATION_MS };
  writeSessions(sessions);
  return token;
}

export function destroySession(token: string): void {
  const sessions = readSessions();
  if (sessions[token]) {
    delete sessions[token];
    writeSessions(sessions);
  }
}

export function destroyAllSessionsForUser(userId: string): void {
  const sessions = readSessions();
  let changed = false;
  for (const [token, session] of Object.entries(sessions)) {
    if (session.userId === userId) {
      delete sessions[token];
      changed = true;
    }
  }
  if (changed) writeSessions(sessions);
}

// CLAUDE-ADDED: Returns the userId for a still-valid session token, lazily evicting it if expired
// -- called on essentially every request (middleware + each API route), so this file is the one
// place session expiry is enforced.
export function resolveSession(token: string | undefined | null): string | null {
  if (!token) return null;
  const sessions = readSessions();
  const session = sessions[token];
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    delete sessions[token];
    writeSessions(sessions);
    return null;
  }

  return session.userId;
}
