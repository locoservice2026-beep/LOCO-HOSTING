require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const path = require('path');
const { openDb } = require('./db');
const { startBot, stopBot, isRunning } = require('./botRunner');

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-very-secret';

async function sendOtpEmail(to, code) {
  // Uses environment variables for SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT || 1025),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'no-reply@loco.local',
    to,
    subject: 'Dein Verifikationscode',
    text: `Dein Verifizierungscode: ${code}`,
  });
  return info;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function requireAuth(req, res, next) {
  const token = req.cookies['lh_token'];
  if (!token) return res.status(401).json({ error: 'unauth' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'unauth' });
  }
}

app.post('/api/register', async (req, res) => {
  const { firstname, lastname, email, password } = req.body || {};
  if (!firstname || !lastname || !email || !password) return res.status(400).json({ error: 'missing' });
  const normalized = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return res.status(400).json({ error: 'invalid_email' });

  const db = await openDb();
  const exists = await db.get('SELECT * FROM users WHERE email = ?', normalized);
  if (exists) return res.status(400).json({ error: 'exists' });

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  await db.run('INSERT INTO users (id, firstname, lastname, email, password_hash, verified, created_at) VALUES (?,?,?,?,?,0,?)', id, firstname, lastname, normalized, hash, Date.now());

  // create OTP
  const code = generateCode();
  const expires = Date.now() + 1000 * 60 * 15; // 15 min
  await db.run('INSERT INTO otps (email, code, expires_at) VALUES (?,?,?)', normalized, code, expires);
  try {
    await sendOtpEmail(normalized, code);
  } catch (e) {
    console.error('sendOtp failed', e);
  }

  res.json({ ok: true, msg: 'otp_sent' });
});

app.post('/api/verify', async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'missing' });
  const normalized = String(email).trim().toLowerCase();
  const db = await openDb();
  const row = await db.get('SELECT * FROM otps WHERE email = ? AND code = ?', normalized, code);
  if (!row) return res.status(400).json({ error: 'invalid_code' });
  if (row.expires_at < Date.now()) return res.status(400).json({ error: 'expired' });

  await db.run('UPDATE users SET verified = 1 WHERE email = ?', normalized);
  await db.run('DELETE FROM otps WHERE email = ?', normalized);

  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing' });
  const normalized = String(email).trim().toLowerCase();
  const db = await openDb();
  const user = await db.get('SELECT * FROM users WHERE email = ?', normalized);
  if (!user) return res.status(400).json({ error: 'invalid' });
  if (!user.verified) return res.status(400).json({ error: 'not_verified' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ error: 'invalid' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('lh_token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('lh_token');
  res.json({ ok: true });
});

// Create a bot (simple)
app.post('/api/bots', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'missing' });
  const db = await openDb();
  const botId = uuidv4();
  const webhookToken = uuidv4();
  const script = 'bots/sample_bot.js';
  await db.run('INSERT INTO bots (id, owner_email, name, script, status, webhook_token, created_at) VALUES (?,?,?,?,?,?,?)', botId, req.user.email, name, script, 'stopped', webhookToken, Date.now());
  res.json({ ok: true, id: botId });
});

app.post('/api/bots/:id/start', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = await openDb();
  const bot = await db.get('SELECT * FROM bots WHERE id = ?', id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  if (bot.owner_email !== req.user.email && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const r = startBot(id, bot.script);
  if (!r.ok) return res.status(400).json(r);
  await db.run('UPDATE bots SET status = ? WHERE id = ?', 'running', id);
  res.json({ ok: true });
});

app.post('/api/bots/:id/stop', requireAuth, async (req, res) => {
  const { id } = req.params;
  const db = await openDb();
  const bot = await db.get('SELECT * FROM bots WHERE id = ?', id);
  if (!bot) return res.status(404).json({ error: 'not_found' });
  if (bot.owner_email !== req.user.email && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const r = stopBot(id);
  if (!r.ok) return res.status(400).json(r);
  await db.run('UPDATE bots SET status = ? WHERE id = ?', 'stopped', id);
  res.json({ ok: true });
});

app.get('/api/mybots', requireAuth, async (req, res) => {
  const db = await openDb();
  const bots = await db.all('SELECT id, name, status, webhook_token FROM bots WHERE owner_email = ?', req.user.email);
  res.json({ ok: true, bots });
});

// Webhook to trigger bot action
app.post('/webhook/:id/:token', async (req, res) => {
  const { id, token } = req.params;
  const db = await openDb();
  const bot = await db.get('SELECT * FROM bots WHERE id = ?', id);
  if (!bot || bot.webhook_token !== token) return res.status(404).json({ error: 'not_found' });
  // For demo: just log and return
  console.log('Webhook for bot', id, 'payload', req.body);
  res.json({ ok: true });
});

// Simple admin list
app.get('/api/admin/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const db = await openDb();
  const users = await db.all('SELECT id, firstname, lastname, email, verified, role, created_at FROM users');
  res.json({ ok: true, users });
});

// Return current user profile
app.get('/api/me', requireAuth, async (req, res) => {
  const db = await openDb();
  const user = await db.get('SELECT id, firstname, lastname, email, verified, role, created_at, webhook FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, user });
});

// Update profile webhook (user-level)
app.post('/api/profile/webhook', requireAuth, async (req, res) => {
  const { webhook } = req.body || {};
  const db = await openDb();
  await db.run('UPDATE users SET webhook = ? WHERE id = ?', webhook || null, req.user.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
