const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const app = express();
const port = Number(process.env.PORT || 3003);
const dbFile = process.env.AUTH_DB_FILE || '/data/auth.sqlite';
const sendgridApiKey = process.env.SENDGRID_API_KEY || '';
const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL || '';
const gmailUser = process.env.GMAIL_USER || '';
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD || '';
const gmailFromEmail = process.env.GMAIL_FROM_EMAIL || gmailUser;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER || '';
const otpDebugMode = process.env.OTP_DEBUG_MODE === '1';
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
const openWeatherApiKey = process.env.OPENWEATHER_API_KEY || '';

let SQL;
let db;
let twilioClient = null;
let gmailTransporter = null;

if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

if (twilioAccountSid && twilioAuthToken) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
}

if (gmailUser && gmailAppPassword) {
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailAppPassword
    }
  });
}

function ensureDbDir() {
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(dbFile, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql, params);
  try {
    if (!stmt.step()) {
      return null;
    }
    return stmt.getAsObject();
  } finally {
    stmt.free();
  }
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql, params);
  const rows = [];
  try {
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }
  return rows;
}

function hasColumn(tableName, columnName) {
  const cols = queryAll(`PRAGMA table_info(${tableName})`);
  return cols.some((col) => String(col.name || '').toLowerCase() === columnName.toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
}

function genOtp() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function normalize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTrafficMultiplier(condition) {
  if (condition === 'low') {
    return 1;
  }
  if (condition === 'medium') {
    return 1.12;
  }
  return 1.28;
}

function getWeatherMultiplier(condition) {
  if (condition === 'clear') {
    return 1;
  }
  if (condition === 'cloudy') {
    return 1.05;
  }
  if (condition === 'rainy') {
    return 1.16;
  }
  return 1.3;
}

function mapWeatherCondition(mainWeather = '', weatherId = 0) {
  const normalized = String(mainWeather || '').toLowerCase();
  if (normalized.includes('thunder') || weatherId >= 200 && weatherId < 300) {
    return 'stormy';
  }
  if (normalized.includes('rain') || normalized.includes('drizzle') || weatherId >= 300 && weatherId < 600) {
    return 'rainy';
  }
  if (normalized.includes('cloud') || weatherId >= 801 && weatherId <= 804) {
    return 'cloudy';
  }
  return 'clear';
}

function inferTrafficCondition(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 1.12) {
    return 'low';
  }
  if (ratio <= 1.35) {
    return 'medium';
  }
  return 'high';
}

function haversineDistanceKm(fromLat, fromLng, toLat, toLng) {
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

async function fetchGoogleTraffic(pickup, drop) {
  if (!googleMapsApiKey) {
    return null;
  }

  const params = new URLSearchParams({
    origins: `${pickup.lat},${pickup.lng}`,
    destinations: `${drop.lat},${drop.lng}`,
    departure_time: 'now',
    traffic_model: 'best_guess',
    key: googleMapsApiKey
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Google traffic request failed: ${response.status}`);
  }

  const json = await response.json();
  const element = json?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') {
    throw new Error(`Google traffic status invalid: ${element?.status || 'unknown'}`);
  }

  const distanceMeters = Number(element?.distance?.value || 0);
  const baseDurationSec = Number(element?.duration?.value || 0);
  const trafficDurationSec = Number(element?.duration_in_traffic?.value || baseDurationSec || 0);
  const ratio = baseDurationSec > 0 ? trafficDurationSec / baseDurationSec : 1;

  return {
    distanceKm: round(distanceMeters / 1000, 2),
    durationInTrafficMinutes: Math.max(1, Math.round(trafficDurationSec / 60)),
    trafficCondition: inferTrafficCondition(ratio),
    trafficRatio: ratio
  };
}

async function fetchOpenWeather(lat, lng) {
  if (!openWeatherApiKey) {
    return null;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    units: 'metric',
    appid: openWeatherApiKey
  });

  const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`OpenWeather request failed: ${response.status}`);
  }

  const json = await response.json();
  const weather = json?.weather?.[0] || {};
  const main = String(weather.main || '').trim();
  const description = String(weather.description || main || 'clear').trim();
  const weatherId = Number(weather.id || 0);
  const tempC = toNumber(json?.main?.temp);

  return {
    weatherCondition: mapWeatherCondition(main, weatherId),
    weatherSummary: description,
    weatherTempC: tempC
  };
}

async function probeUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildIntegrationHealthPayload() {
  const checkedAt = nowIso();
  const otpEmailProvider = otpDebugMode
    ? 'debug'
    : (gmailTransporter
      ? 'gmail'
      : ((sendgridApiKey && sendgridFromEmail) ? 'sendgrid' : 'none'));

  const googleConfigured = !!googleMapsApiKey;
  const weatherConfigured = !!openWeatherApiKey;
  const otpConfigured =
    otpDebugMode ||
    !!gmailTransporter ||
    !!(sendgridApiKey && sendgridFromEmail) ||
    !!(twilioAccountSid && twilioAuthToken && twilioFromNumber);

  const [googleReachable, weatherReachable] = await Promise.all([
    googleConfigured
      ? probeUrl(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=12.9716,77.5946&destinations=12.9352,77.6245&departure_time=now&key=${encodeURIComponent(googleMapsApiKey)}`
        )
      : Promise.resolve(false),
    weatherConfigured
      ? probeUrl(
          `https://api.openweathermap.org/data/2.5/weather?lat=12.9716&lon=77.5946&appid=${encodeURIComponent(openWeatherApiKey)}`
        )
      : Promise.resolve(false)
  ]);

  const integrations = [
    {
      key: 'authService',
      name: 'Auth Service Core',
      statusColor: 'green',
      healthy: true,
      details: 'Service process is running.',
      configured: true,
      checkedAt
    },
    {
      key: 'otpDelivery',
      name: 'OTP Delivery Channel',
      statusColor: otpConfigured ? 'green' : 'red',
      healthy: otpConfigured,
      otpProvider: otpEmailProvider,
      details: otpConfigured
        ? (otpDebugMode
          ? 'OTP debug mode is active.'
          : (gmailTransporter
            ? 'Gmail SMTP OTP delivery is configured.'
            : 'Delivery provider credentials are configured.'))
        : 'Missing Gmail/SendGrid/Twilio credentials.',
      configured: otpConfigured,
      checkedAt
    },
    {
      key: 'googleMaps',
      name: 'Google Maps Distance Matrix',
      statusColor: googleConfigured && googleReachable ? 'green' : 'red',
      healthy: googleConfigured && googleReachable,
      details: !googleConfigured
        ? 'GOOGLE_MAPS_API_KEY is missing.'
        : (googleReachable ? 'Provider reachable.' : 'Provider unreachable or API call failed.'),
      configured: googleConfigured,
      checkedAt
    },
    {
      key: 'openWeather',
      name: 'OpenWeather API',
      statusColor: weatherConfigured && weatherReachable ? 'green' : 'red',
      healthy: weatherConfigured && weatherReachable,
      details: !weatherConfigured
        ? 'OPENWEATHER_API_KEY is missing.'
        : (weatherReachable ? 'Provider reachable.' : 'Provider unreachable or API call failed.'),
      configured: weatherConfigured,
      checkedAt
    }
  ];

  const status = integrations.every((item) => item.healthy) ? 'ok' : 'degraded';

  return {
    service: 'auth-service',
    status,
    checkedAt,
    otpProvider: otpEmailProvider,
    integrations
  };
}

async function sendEmailOtp(email, otp) {
  if (gmailTransporter && gmailFromEmail) {
    await gmailTransporter.sendMail({
      from: gmailFromEmail,
      to: email,
      subject: 'Your Delivery App OTP',
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 5 minutes.</p>`
    });
    return;
  }

  if (sendgridApiKey && sendgridFromEmail) {
    await sgMail.send({
      to: email,
      from: sendgridFromEmail,
      subject: 'Your Delivery App OTP',
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 5 minutes.</p>`
    });
    return;
  }

  if (!otpDebugMode) {
    throw new Error('No email OTP provider configured. Set Gmail SMTP or SendGrid settings.');
  }

  if (!sendgridApiKey || !sendgridFromEmail) {
    console.log(`[DEV OTP EMAIL] ${email}: ${otp}`);
    return;
  }
}

async function sendSmsOtp(mobile, otp) {
  if (!twilioClient || !twilioFromNumber) {
    console.log(`[DEV OTP SMS] ${mobile}: ${otp}`);
    return;
  }

  await twilioClient.messages.create({
    body: `Your Delivery App OTP is ${otp}. Valid for 5 minutes.`,
    from: twilioFromNumber,
    to: mobile
  });
}

function issueTempToken(userId) {
  const token = `tmp_${uuidv4()}`;
  run(
    `INSERT INTO auth_sessions (id, user_id, token, type, mfa_verified, voice_verified, expires_at, created_at)
     VALUES (?, ?, ?, 'temp', 0, 0, ?, ?)`,
    [uuidv4(), userId, token, new Date(Date.now() + 10 * 60 * 1000).toISOString(), nowIso()]
  );
  return token;
}

function issueSessionToken(userId) {
  const token = `sess_${uuidv4()}`;
  run(
    `INSERT INTO auth_sessions (id, user_id, token, type, mfa_verified, voice_verified, expires_at, created_at)
     VALUES (?, ?, ?, 'session', 1, 0, ?, ?)`,
    [uuidv4(), userId, token, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), nowIso()]
  );
  return token;
}

function getSession(token) {
  if (!token) {
    return null;
  }
  return queryOne(
    `SELECT s.*, u.username, u.display_name, u.role, u.email, u.mobile, u.captain_vehicle, u.profile_image
     FROM auth_sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > ?`,
    [token, nowIso()]
  );
}

function safeParseJson(jsonText, fallback) {
  if (!jsonText) {
    return fallback;
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    return fallback;
  }
}

function toBool(value) {
  return Number(value || 0) === 1;
}

function mapBookingRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    bookingFor: row.booking_for,
    recipientName: row.recipient_name || undefined,
    recipientPhone: row.recipient_phone || undefined,
    isScheduled: toBool(row.is_scheduled),
    scheduledAt: row.scheduled_at || undefined,
    serviceType: row.service_type,
    paymentMethod: row.payment_method,
    vehicleType: row.vehicle_type,
    pickup: safeParseJson(row.pickup_json, { lat: 0, lng: 0, address: '' }),
    drop: safeParseJson(row.drop_json, { lat: 0, lng: 0, address: '' }),
    currentLocation: safeParseJson(row.current_location_json, { lat: 0, lng: 0, address: '' }),
    status: row.status,
    otp: row.otp,
    otpVerified: toBool(row.otp_verified),
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    captainId: row.captain_id || undefined,
    notificationTarget: row.notification_target || 'preferred',
    preferredCaptainId: row.preferred_captain_id || undefined,
    preferredCaptainName: row.preferred_captain_name || undefined,
    notification: row.notification,
    estimatedFare: row.estimated_fare !== null && row.estimated_fare !== undefined ? Number(row.estimated_fare) : undefined,
    rideNotes: row.ride_notes || undefined,
    sosTriggered: toBool(row.sos_triggered),
    sosByRole: row.sos_by_role || undefined,
    feedbackSubmitted: toBool(row.feedback_submitted),
    feedbackSubmittedAt: row.feedback_submitted_at || undefined,
    feedbackText: row.feedback_text || undefined,
    rideRating: row.ride_rating !== null && row.ride_rating !== undefined ? Number(row.ride_rating) : undefined,
    captainRating: row.captain_rating !== null && row.captain_rating !== undefined ? Number(row.captain_rating) : undefined,
    lovedRide: toBool(row.loved_ride),
    lovedCaptain: toBool(row.loved_captain),
    finalAmount: row.final_amount !== null && row.final_amount !== undefined ? Number(row.final_amount) : undefined,
    paymentDone: toBool(row.payment_done),
    paymentDoneAt: row.payment_done_at || undefined,
    trackingClosed: toBool(row.tracking_closed),
    trackingClosedAt: row.tracking_closed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isCaptainAssignedToBooking(session, bookingRow) {
  const captainId = String(session.user_id || '').trim().toLowerCase();
  const captainUserName = String(session.username || '').trim().toLowerCase();
  const captainDisplayName = String(session.display_name || '').trim().toLowerCase();

  const bookingCaptainId = String(bookingRow.captain_id || '').trim().toLowerCase();
  const preferredCaptainId = String(bookingRow.preferred_captain_id || '').trim().toLowerCase();
  const driverName = String(bookingRow.driver_name || '').trim().toLowerCase();
  const preferredCaptainName = String(bookingRow.preferred_captain_name || '').trim().toLowerCase();
  const target = String(bookingRow.notification_target || 'preferred').trim().toLowerCase();

  if (target === 'all') {
    return true;
  }

  return (
    (bookingCaptainId && (bookingCaptainId === captainId || bookingCaptainId === captainUserName)) ||
    (preferredCaptainId && (preferredCaptainId === captainId || preferredCaptainId === captainUserName)) ||
    (driverName && (driverName === captainDisplayName || driverName === captainUserName)) ||
    (preferredCaptainName && (preferredCaptainName === captainDisplayName || preferredCaptainName === captainUserName))
  );
}

function canAccessBooking(session, bookingRow) {
  const role = String(session.role || '').trim().toLowerCase();
  if (role === 'admin') {
    return true;
  }

  if (role === 'customer') {
    return String(bookingRow.user_id || '') === String(session.user_id || '');
  }

  if (role === 'captain') {
    return isCaptainAssignedToBooking(session, bookingRow);
  }

  return false;
}

function insertBookingRecord(booking) {
  const values = [
    booking.id,
    booking.userId,
    booking.userName,
    booking.bookingFor,
    booking.recipientName || null,
    booking.recipientPhone || null,
    booking.isScheduled ? 1 : 0,
    booking.scheduledAt || null,
    booking.serviceType,
    booking.paymentMethod,
    booking.vehicleType,
    JSON.stringify(booking.pickup),
    JSON.stringify(booking.drop),
    JSON.stringify(booking.currentLocation),
    booking.status,
    booking.otp,
    booking.otpVerified ? 1 : 0,
    booking.driverName,
    booking.driverPhone,
    booking.captainId || null,
    booking.notificationTarget || 'preferred',
    booking.preferredCaptainId || null,
    booking.preferredCaptainName || null,
    booking.notification,
    booking.estimatedFare !== undefined ? Number(booking.estimatedFare) : null,
    booking.rideNotes || null,
    booking.sosTriggered ? 1 : 0,
    booking.sosByRole || null,
    booking.feedbackSubmitted ? 1 : 0,
    booking.feedbackSubmittedAt || null,
    booking.feedbackText || null,
    booking.rideRating !== undefined ? Number(booking.rideRating) : null,
    booking.captainRating !== undefined ? Number(booking.captainRating) : null,
    booking.lovedRide ? 1 : 0,
    booking.lovedCaptain ? 1 : 0,
    booking.finalAmount !== undefined ? Number(booking.finalAmount) : null,
    booking.paymentDone ? 1 : 0,
    booking.paymentDoneAt || null,
    booking.trackingClosed ? 1 : 0,
    booking.trackingClosedAt || null,
    booking.createdAt,
    booking.updatedAt
  ];

  const placeholders = values.map(() => '?').join(', ');

  run(
    `INSERT INTO bookings (
      id, user_id, user_name, booking_for, recipient_name, recipient_phone, is_scheduled, scheduled_at,
      service_type, payment_method, vehicle_type, pickup_json, drop_json, current_location_json, status,
      otp, otp_verified, driver_name, driver_phone, captain_id, notification_target, preferred_captain_id,
      preferred_captain_name, notification, estimated_fare, ride_notes, sos_triggered, sos_by_role,
      feedback_submitted, feedback_submitted_at, feedback_text, ride_rating, captain_rating, loved_ride,
      loved_captain, final_amount, payment_done, payment_done_at, tracking_closed, tracking_closed_at,
      created_at, updated_at
    ) VALUES (${placeholders})` ,
    values
  );
}

function requireSession(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.sessionToken;
  const session = getSession(token);
  if (!session || session.type !== 'session') {
    return res.status(401).json({ error: 'Valid session token required.' });
  }
  req.session = session;
  return next();
}

async function initDb() {
  SQL = await initSqlJs();
  ensureDbDir();

  if (fs.existsSync(dbFile)) {
    const file = fs.readFileSync(dbFile);
    db = new SQL.Database(file);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      mobile TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      captain_vehicle TEXT,
      profile_image TEXT,
      customer_otp_completed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token TEXT NOT NULL,
      channel TEXT NOT NULL,
      code TEXT NOT NULL,
      consumed INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      mfa_verified INTEGER NOT NULL,
      voice_verified INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_challenges (
      id TEXT PRIMARY KEY,
      session_token TEXT NOT NULL,
      phrase TEXT NOT NULL,
      consumed INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS captain_feedback (
      id TEXT PRIMARY KEY,
      booking_id TEXT UNIQUE NOT NULL,
      captain_user_id TEXT,
      captain_name TEXT NOT NULL,
      submitted_by_user_id TEXT NOT NULL,
      submitted_by_name TEXT NOT NULL,
      ride_rating INTEGER NOT NULL,
      captain_rating INTEGER NOT NULL,
      feedback_text TEXT,
      loved_ride INTEGER NOT NULL,
      loved_captain INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      booking_for TEXT NOT NULL,
      recipient_name TEXT,
      recipient_phone TEXT,
      is_scheduled INTEGER NOT NULL DEFAULT 0,
      scheduled_at TEXT,
      service_type TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      pickup_json TEXT NOT NULL,
      drop_json TEXT NOT NULL,
      current_location_json TEXT NOT NULL,
      status TEXT NOT NULL,
      otp TEXT NOT NULL,
      otp_verified INTEGER NOT NULL DEFAULT 0,
      driver_name TEXT NOT NULL,
      driver_phone TEXT NOT NULL,
      captain_id TEXT,
      notification_target TEXT NOT NULL DEFAULT 'preferred',
      preferred_captain_id TEXT,
      preferred_captain_name TEXT,
      notification TEXT NOT NULL,
      estimated_fare REAL,
      ride_notes TEXT,
      sos_triggered INTEGER NOT NULL DEFAULT 0,
      sos_by_role TEXT,
      feedback_submitted INTEGER NOT NULL DEFAULT 0,
      feedback_submitted_at TEXT,
      feedback_text TEXT,
      ride_rating INTEGER,
      captain_rating INTEGER,
      loved_ride INTEGER NOT NULL DEFAULT 0,
      loved_captain INTEGER NOT NULL DEFAULT 0,
      final_amount REAL,
      payment_done INTEGER NOT NULL DEFAULT 0,
      payment_done_at TEXT,
      tracking_closed INTEGER NOT NULL DEFAULT 0,
      tracking_closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  if (!hasColumn('users', 'captain_vehicle')) {
    db.run(`ALTER TABLE users ADD COLUMN captain_vehicle TEXT`);
  }

  if (!hasColumn('users', 'profile_image')) {
    db.run(`ALTER TABLE users ADD COLUMN profile_image TEXT`);
  }

  if (!hasColumn('users', 'customer_otp_completed')) {
    db.run(`ALTER TABLE users ADD COLUMN customer_otp_completed INTEGER NOT NULL DEFAULT 1`);
  }

  if (!hasColumn('bookings', 'final_amount')) {
    db.run(`ALTER TABLE bookings ADD COLUMN final_amount REAL`);
  }

  if (!hasColumn('bookings', 'payment_done')) {
    db.run(`ALTER TABLE bookings ADD COLUMN payment_done INTEGER NOT NULL DEFAULT 0`);
  }

  if (!hasColumn('bookings', 'payment_done_at')) {
    db.run(`ALTER TABLE bookings ADD COLUMN payment_done_at TEXT`);
  }

  if (!hasColumn('bookings', 'tracking_closed')) {
    db.run(`ALTER TABLE bookings ADD COLUMN tracking_closed INTEGER NOT NULL DEFAULT 0`);
  }

  if (!hasColumn('bookings', 'tracking_closed_at')) {
    db.run(`ALTER TABLE bookings ADD COLUMN tracking_closed_at TEXT`);
  }

  const seedUser = queryOne('SELECT * FROM users WHERE username = ?', ['user']);
  if (!seedUser) {
    const userHash = bcrypt.hashSync('user123', 10);
    run(
      `INSERT INTO users (id, username, display_name, email, mobile, password, role, customer_otp_completed, created_at)
       VALUES (?, 'user', 'Delivery User', 'user@delivery.app', '+919999000001', ?, 'customer', 1, ?);`,
      [uuidv4(), userHash, nowIso()]
    );
  }

  const seedAdmin = queryOne('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!seedAdmin) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    run(
      `INSERT INTO users (id, username, display_name, email, mobile, password, role, customer_otp_completed, created_at)
       VALUES (?, 'admin', 'Operations Admin', 'admin@delivery.app', '+919999000002', ?, 'admin', 1, ?);`,
      [uuidv4(), adminHash, nowIso()]
    );
  }

  const existingUsers = queryAll('SELECT id, password FROM users');
  for (const row of existingUsers) {
    const stored = String(row.password || '');
    const isBcrypt = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
    if (!isBcrypt) {
      const migratedHash = bcrypt.hashSync(stored, 10);
      run('UPDATE users SET password = ? WHERE id = ?', [migratedHash, row.id]);
    }
  }

  run(`UPDATE users SET role = 'customer' WHERE role = 'user'`);

  saveDb();
}

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ service: 'auth-service', status: 'ok' });
});

app.get('/api/integrations/health', async (_req, res) => {
  try {
    const payload = await buildIntegrationHealthPayload();
    return res.json(payload);
  } catch (error) {
    console.error('Integration health endpoint error', error);
    return res.status(500).json({
      service: 'auth-service',
      status: 'degraded',
      checkedAt: nowIso(),
      integrations: [],
      error: 'Unable to compute integration health right now.'
    });
  }
});

app.post('/api/pricing/live-fare', async (req, res) => {
  try {
    const body = req.body || {};
    const pickup = body.pickup || {};
    const drop = body.drop || {};
    const vehicleType = String(body.vehicleType || 'bike').toLowerCase();

    const pickupLat = toNumber(pickup.lat);
    const pickupLng = toNumber(pickup.lng);
    const dropLat = toNumber(drop.lat);
    const dropLng = toNumber(drop.lng);

    if ([pickupLat, pickupLng, dropLat, dropLng].some((value) => value === null)) {
      return res.status(400).json({ error: 'pickup/drop coordinates are required.' });
    }

    const vehicleMultipliers = {
      bike: 1,
      auto: 1.25,
      scooter: 1.1,
      car: 1.5,
      van: 1.9,
      truck: 2.4
    };

    const validVehicle = Object.prototype.hasOwnProperty.call(vehicleMultipliers, vehicleType) ? vehicleType : 'bike';

    let trafficData = null;
    let weatherData = null;

    try {
      [trafficData, weatherData] = await Promise.all([
        fetchGoogleTraffic({ lat: pickupLat, lng: pickupLng }, { lat: dropLat, lng: dropLng }),
        fetchOpenWeather(pickupLat, pickupLng)
      ]);
    } catch (error) {
      console.warn('Live pricing provider error:', error?.message || error);
    }

    const fallbackDistanceKm = round(Math.max(0.5, haversineDistanceKm(pickupLat, pickupLng, dropLat, dropLng)), 2);
    const distanceKm = trafficData?.distanceKm || fallbackDistanceKm;
    const durationInTrafficMinutes = trafficData?.durationInTrafficMinutes || Math.max(3, Math.round(distanceKm * 4.5));
    const trafficCondition = trafficData?.trafficCondition || 'medium';
    const weatherCondition = weatherData?.weatherCondition || 'clear';
    const weatherSummary = weatherData?.weatherSummary || 'clear sky';
    const weatherTempC = weatherData?.weatherTempC ?? null;

    const baseFare = 55;
    const distanceFare = round(distanceKm * 22, 0);
    const vehicleMultiplier = vehicleMultipliers[validVehicle];
    const trafficMultiplier = getTrafficMultiplier(trafficCondition);
    const weatherMultiplier = getWeatherMultiplier(weatherCondition);
    const subtotal = (baseFare + distanceFare) * vehicleMultiplier;
    const total = Math.round(subtotal * trafficMultiplier * weatherMultiplier);

    return res.json({
      distanceKm,
      durationInTrafficMinutes,
      trafficCondition,
      weatherCondition,
      weatherSummary,
      weatherTempC,
      source: {
        googleTraffic: !!trafficData,
        openWeather: !!weatherData
      },
      breakdown: {
        baseFare,
        distanceFare,
        vehicleMultiplier,
        trafficMultiplier,
        weatherMultiplier,
        total
      },
      suggestedMessage: `Traffic ${trafficCondition}, weather ${weatherCondition}. Estimated travel ${durationInTrafficMinutes} min.`
    });
  } catch (error) {
    console.error('Live fare endpoint error', error);
    return res.status(500).json({ error: 'Unable to compute live fare right now.' });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { username, displayName, email, mobile, password, role, captainVehicle, profileImageUrl } = req.body || {};
  if (!username || !displayName || !email || !mobile || !password || !role) {
    return res.status(400).json({ error: 'username, displayName, email, mobile, password, role are required.' });
  }

  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!['customer', 'admin', 'captain'].includes(normalizedRole)) {
    return res.status(400).json({ error: 'role must be customer, admin, or captain.' });
  }

  if (normalizedRole === 'captain' && !captainVehicle) {
    return res.status(400).json({ error: 'captainVehicle is required for captain registration.' });
  }

  const exists = queryOne('SELECT id FROM users WHERE username = ? OR email = ? OR mobile = ?', [username, email, mobile]);
  if (exists) {
    return res.status(409).json({ error: 'User already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  run(
    `INSERT INTO users (id, username, display_name, email, mobile, password, role, captain_vehicle, profile_image, customer_otp_completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      uuidv4(),
      username.trim().toLowerCase(),
      displayName.trim(),
      email.trim().toLowerCase(),
      mobile.trim(),
      passwordHash,
      normalizedRole,
      normalizedRole === 'captain' ? String(captainVehicle).trim() : null,
      profileImageUrl ? String(profileImageUrl).trim() : null,
      normalizedRole === 'customer' ? 0 : 1,
      nowIso()
    ]
  );

  if (normalizedRole !== 'customer') {
    return res.status(201).json({ message: 'User registered successfully.' });
  }

  const createdUser = queryOne('SELECT * FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  const tempToken = issueTempToken(createdUser.id);
  const emailOtp = genOtp();
  const mobileOtp = genOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  run(
    `INSERT INTO otp_codes (id, user_id, session_token, channel, code, consumed, expires_at, created_at)
     VALUES (?, ?, ?, 'email', ?, 0, ?, ?)` ,
    [uuidv4(), createdUser.id, tempToken, emailOtp, expiresAt, nowIso()]
  );

  run(
    `INSERT INTO otp_codes (id, user_id, session_token, channel, code, consumed, expires_at, created_at)
     VALUES (?, ?, ?, 'mobile', ?, 0, ?, ?)` ,
    [uuidv4(), createdUser.id, tempToken, mobileOtp, expiresAt, nowIso()]
  );

  Promise.all([
    sendEmailOtp(createdUser.email, emailOtp),
    sendSmsOtp(createdUser.mobile, mobileOtp)
  ]).catch((error) => {
    console.error('Registration OTP delivery error', error);
  });

  const payload = {
    message: 'User registered successfully. Verify OTP once to activate account.',
    requiresOtp: true,
    tempToken,
    channels: {
      email: createdUser.email,
      mobile: createdUser.mobile
    }
  };

  if (otpDebugMode) {
    payload.devOtps = {
      emailOtp,
      mobileOtp
    };
  }

  return res.status(201).json(payload);
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body || {};
  const user = queryOne('SELECT * FROM users WHERE username = ?', [(username || '').trim().toLowerCase()]);
  if (!user || !bcrypt.compareSync(String(password || ''), String(user.password || ''))) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const requestedRole = String(role || '').trim().toLowerCase();
  if (requestedRole && requestedRole !== String(user.role || '').toLowerCase()) {
    return res.status(401).json({ error: 'Selected login mode does not match your account role.' });
  }

  if (String(user.role || '').toLowerCase() === 'customer' && Number(user.customer_otp_completed || 0) !== 1) {
    return res.status(403).json({ error: 'Complete your one-time registration OTP verification first.' });
  }

  const sessionToken = issueSessionToken(user.id);
  return res.json({
    requiresOtp: false,
    tempToken: '',
    sessionToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      email: user.email,
      mobile: user.mobile,
      captainVehicle: user.captain_vehicle || undefined,
      profileImageUrl: user.profile_image || undefined
    },
    message: 'Login successful.',
    channels: {
      email: user.email,
      mobile: user.mobile
    }
  });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { tempToken, emailOtp, mobileOtp } = req.body || {};
  const session = getSession(tempToken);

  if (!session || session.type !== 'temp') {
    return res.status(401).json({ error: 'Invalid or expired temporary token.' });
  }

  const emailCode = queryOne(
    `SELECT * FROM otp_codes WHERE session_token = ? AND channel = 'email' AND consumed = 0 AND expires_at > ?`,
    [tempToken, nowIso()]
  );
  const mobileCode = queryOne(
    `SELECT * FROM otp_codes WHERE session_token = ? AND channel = 'mobile' AND consumed = 0 AND expires_at > ?`,
    [tempToken, nowIso()]
  );

  if (!emailCode || !mobileCode || emailCode.code !== String(emailOtp || '').trim() || mobileCode.code !== String(mobileOtp || '').trim()) {
    return res.status(400).json({ error: 'Invalid OTP values.' });
  }

  run('UPDATE otp_codes SET consumed = 1 WHERE session_token = ?', [tempToken]);
  run('UPDATE auth_sessions SET mfa_verified = 1 WHERE token = ?', [tempToken]);
  if (String(session.role || '').toLowerCase() === 'customer') {
    run('UPDATE users SET customer_otp_completed = 1 WHERE id = ?', [session.user_id]);
  }

  const sessionToken = issueSessionToken(session.user_id);

  return res.json({
    sessionToken,
    user: {
      id: session.user_id,
      username: session.username,
      displayName: session.display_name,
      role: session.role,
      email: session.email,
      mobile: session.mobile,
      captainVehicle: session.captain_vehicle || undefined,
      profileImageUrl: session.profile_image || undefined
    },
    message: 'OTP verification successful. Voice step-up required for sensitive actions.'
  });
});

app.post('/api/auth/voice-challenge', requireSession, (req, res) => {
  const phrases = [
    'confirm secure delivery now',
    'my parcel is ready to drop',
    'verify identity for final delivery',
    'authorize sensitive user action'
  ];

  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  const expiresAt = new Date(Date.now() + 4 * 60 * 1000).toISOString();

  run(
    `INSERT INTO voice_challenges (id, session_token, phrase, consumed, expires_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [uuidv4(), req.session.token, phrase, expiresAt, nowIso()]
  );

  return res.json({ phrase, expiresAt });
});

app.post('/api/auth/voice-verify', requireSession, (req, res) => {
  const { spokenText } = req.body || {};

  const challenge = queryOne(
    `SELECT * FROM voice_challenges WHERE session_token = ? AND consumed = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1`,
    [req.session.token, nowIso()]
  );

  if (!challenge) {
    return res.status(400).json({ error: 'No active voice challenge.' });
  }

  const expected = normalize(challenge.phrase);
  const spoken = normalize(spokenText || '');
  const success = expected === spoken;

  if (!success) {
    return res.status(400).json({ error: 'Voice phrase does not match challenge.' });
  }

  run('UPDATE voice_challenges SET consumed = 1 WHERE id = ?', [challenge.id]);
  run('UPDATE auth_sessions SET voice_verified = 1 WHERE token = ?', [req.session.token]);

  return res.json({ message: 'Voice step-up successful.' });
});

app.post('/api/auth/user-action', requireSession, (req, res) => {
  const { actionType, metadata } = req.body || {};
  if (!actionType) {
    return res.status(400).json({ error: 'actionType is required.' });
  }

  const isAdmin = String(req.session.role || '').toLowerCase() === 'admin';
  const requiresVoice = isAdmin && actionType === 'otp_verify';
  if (requiresVoice && Number(req.session.voice_verified) !== 1) {
    return res.status(403).json({ error: 'Voice step-up required for this action.' });
  }

  run(
    `INSERT INTO user_actions (id, user_id, action_type, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), req.session.user_id, actionType, JSON.stringify(metadata || {}), nowIso()]
  );

  if (requiresVoice) {
    run('UPDATE auth_sessions SET voice_verified = 0 WHERE token = ?', [req.session.token]);
  }

  return res.json({ message: 'User action recorded.' });
});

app.get('/api/auth/actions', requireSession, (req, res) => {
  const isAdmin = String(req.session.role || '').toLowerCase() === 'admin';
  const rows = isAdmin
    ? queryAll(
        `SELECT action_type, metadata_json, created_at, user_id
         FROM user_actions
         ORDER BY created_at DESC
         LIMIT 100`
      )
    : queryAll(
        `SELECT action_type, metadata_json, created_at, user_id
         FROM user_actions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.session.user_id]
      );

  const payload = rows.map((row) => ({
    actionType: row.action_type,
    metadata: (() => {
      try {
        return JSON.parse(row.metadata_json || '{}');
      } catch {
        return {};
      }
    })(),
    createdAt: row.created_at,
    userId: row.user_id
  }));

  return res.json(payload);
});

app.get('/api/auth/me', requireSession, (req, res) => {
  return res.json({
    user: {
      id: req.session.user_id,
      username: req.session.username,
      displayName: req.session.display_name,
      role: req.session.role,
      email: req.session.email,
      mobile: req.session.mobile,
      captainVehicle: req.session.captain_vehicle || undefined,
      profileImageUrl: req.session.profile_image || undefined
    },
    mfaVerified: Number(req.session.mfa_verified) === 1,
    voiceVerified: Number(req.session.voice_verified) === 1
  });
});

app.get('/api/auth/captains', requireSession, (req, res) => {
  const vehicleType = String(req.query.vehicleType || '').trim().toLowerCase();
  const allowedVehicles = new Set(['bike', 'auto', 'car', 'scooter', 'van', 'truck']);

  const rows = vehicleType && allowedVehicles.has(vehicleType)
    ? queryAll(
        `SELECT id, username, display_name, mobile, captain_vehicle, profile_image, created_at
         FROM users
         WHERE role = 'captain' AND LOWER(COALESCE(captain_vehicle, '')) = ?
         ORDER BY created_at DESC`,
        [vehicleType]
      )
    : queryAll(
        `SELECT id, username, display_name, mobile, captain_vehicle, profile_image, created_at
         FROM users
         WHERE role = 'captain'
         ORDER BY created_at DESC`
      );

  const payload = rows.map((row, index) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    phone: row.mobile,
    vehicleType: String(row.captain_vehicle || 'bike').toLowerCase(),
    profileImageUrl: row.profile_image || undefined,
    rating: Number((4.2 + ((index % 7) * 0.1)).toFixed(1)),
    availability: 'available',
    createdAt: row.created_at
  }));

  return res.json(payload);
});

app.post('/api/auth/profile-image', requireSession, (req, res) => {
  const { profileImageUrl } = req.body || {};
  if (!profileImageUrl) {
    return res.status(400).json({ error: 'profileImageUrl is required.' });
  }

  run('UPDATE users SET profile_image = ? WHERE id = ?', [String(profileImageUrl).trim(), req.session.user_id]);
  return res.json({ message: 'Profile image updated successfully.', profileImageUrl: String(profileImageUrl).trim() });
});

app.post('/api/auth/captain-feedback', requireSession, (req, res) => {
  const {
    bookingId,
    captainId,
    captainName,
    rideRating,
    captainRating,
    feedbackText,
    lovedRide,
    lovedCaptain
  } = req.body || {};

  if (!bookingId || !captainName || !rideRating || !captainRating) {
    return res.status(400).json({ error: 'bookingId, captainName, rideRating, and captainRating are required.' });
  }

  const ride = Number(rideRating);
  const captain = Number(captainRating);
  if (Number.isNaN(ride) || Number.isNaN(captain) || ride < 1 || ride > 5 || captain < 1 || captain > 5) {
    return res.status(400).json({ error: 'rideRating and captainRating must be numbers between 1 and 5.' });
  }

  const now = nowIso();
  const existing = queryOne('SELECT id, created_at FROM captain_feedback WHERE booking_id = ?', [String(bookingId)]);
  if (existing) {
    run(
      `UPDATE captain_feedback
       SET captain_user_id = ?, captain_name = ?, submitted_by_user_id = ?, submitted_by_name = ?,
           ride_rating = ?, captain_rating = ?, feedback_text = ?, loved_ride = ?, loved_captain = ?, updated_at = ?
       WHERE booking_id = ?`,
      [
        captainId ? String(captainId) : null,
        String(captainName).trim(),
        req.session.user_id,
        String(req.session.display_name || req.session.username || 'Customer').trim(),
        ride,
        captain,
        (String(feedbackText || '').trim() || null),
        lovedRide ? 1 : 0,
        lovedCaptain ? 1 : 0,
        now,
        String(bookingId)
      ]
    );
  } else {
    run(
      `INSERT INTO captain_feedback (
        id, booking_id, captain_user_id, captain_name, submitted_by_user_id, submitted_by_name,
        ride_rating, captain_rating, feedback_text, loved_ride, loved_captain, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        String(bookingId),
        captainId ? String(captainId) : null,
        String(captainName).trim(),
        req.session.user_id,
        String(req.session.display_name || req.session.username || 'Customer').trim(),
        ride,
        captain,
        (String(feedbackText || '').trim() || null),
        lovedRide ? 1 : 0,
        lovedCaptain ? 1 : 0,
        now,
        now
      ]
    );
  }

  return res.json({ message: 'Captain feedback saved successfully.' });
});

app.get('/api/auth/captain-feedback/stats', requireSession, (req, res) => {
  const isAdmin = String(req.session.role || '').toLowerCase() === 'admin';
  const isCaptain = String(req.session.role || '').toLowerCase() === 'captain';
  if (!isAdmin && !isCaptain) {
    return res.status(403).json({ error: 'Captain or admin role required.' });
  }

  const captainUserId = isAdmin ? (req.query.captainId ? String(req.query.captainId) : '') : req.session.user_id;
  const captainName = isAdmin
    ? String(req.query.captainName || '').trim()
    : String(req.session.display_name || '').trim();

  if (!captainUserId && !captainName) {
    return res.status(400).json({ error: 'captainId or captainName is required.' });
  }

  const whereSql = `
    (captain_user_id = ?)
    OR (captain_user_id IS NULL OR captain_user_id = '') AND LOWER(captain_name) = LOWER(?)
  `;
  const params = [captainUserId, captainName];

  const aggregate = queryOne(
    `SELECT
      COUNT(*) AS feedback_count,
      AVG(captain_rating) AS avg_captain_rating,
      AVG(ride_rating) AS avg_ride_rating,
      SUM(COALESCE(loved_captain, 0) + COALESCE(loved_ride, 0)) AS total_hearts
     FROM captain_feedback
     WHERE ${whereSql}`,
    params
  ) || {};

  const comments = queryAll(
    `SELECT
      booking_id,
      submitted_by_name,
      ride_rating,
      captain_rating,
      feedback_text,
      loved_ride,
      loved_captain,
      created_at
     FROM captain_feedback
     WHERE ${whereSql} AND feedback_text IS NOT NULL AND TRIM(feedback_text) <> ''
     ORDER BY created_at DESC
     LIMIT 8`,
    params
  );

  return res.json({
    feedbackCount: Number(aggregate.feedback_count || 0),
    avgCaptainRating: Number(Number(aggregate.avg_captain_rating || 0).toFixed(1)),
    avgRideRating: Number(Number(aggregate.avg_ride_rating || 0).toFixed(1)),
    totalHearts: Number(aggregate.total_hearts || 0),
    recentComments: comments.map((row) => ({
      bookingId: row.booking_id,
      userName: row.submitted_by_name,
      rideRating: Number(row.ride_rating || 0),
      captainRating: Number(row.captain_rating || 0),
      feedbackText: row.feedback_text || '',
      lovedRide: Number(row.loved_ride || 0) === 1,
      lovedCaptain: Number(row.loved_captain || 0) === 1,
      createdAt: row.created_at
    }))
  });
});

app.post('/api/auth/logout', requireSession, (req, res) => {
  run('DELETE FROM auth_sessions WHERE token = ?', [req.session.token]);
  return res.json({ message: 'Logged out successfully.' });
});

app.get('/api/bookings', requireSession, (req, res) => {
  const role = String(req.session.role || '').toLowerCase();
  const statusFilter = String(req.query.status || '').trim().toLowerCase();
  const includeCompleted = String(req.query.includeCompleted || '').toLowerCase() === 'true';
  const maxItems = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

  const allRows = queryAll('SELECT * FROM bookings ORDER BY updated_at DESC LIMIT ?', [maxItems]);
  const visibleRows = allRows.filter((row) => canAccessBooking(req.session, row));

  const filteredRows = visibleRows.filter((row) => {
    if (!includeCompleted && statusFilter !== 'completed' && statusFilter !== 'cancelled') {
      if (row.status === 'completed' || row.status === 'cancelled') {
        return false;
      }
    }

    if (statusFilter && row.status !== statusFilter) {
      return false;
    }

    if (role === 'captain' && !includeCompleted) {
      return row.status !== 'completed' && row.status !== 'cancelled';
    }

    return true;
  });

  return res.json(filteredRows.map(mapBookingRow));
});

app.get('/api/bookings/:bookingId', requireSession, (req, res) => {
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  return res.json(mapBookingRow(booking));
});

app.post('/api/bookings', requireSession, (req, res) => {
  const body = req.body || {};
  const now = nowIso();
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;
  const isScheduled = !!scheduledAt && new Date(scheduledAt).getTime() > Date.now();
  const otp = genOtp();

  const pickup = body.pickup || {};
  const drop = body.drop || {};

  if (!pickup.address || !drop.address) {
    return res.status(400).json({ error: 'pickup and drop addresses are required.' });
  }

  const booking = {
    id: `BK-${Date.now().toString().slice(-8)}`,
    userId: req.session.user_id,
    userName: req.session.display_name || req.session.username || 'Customer',
    bookingFor: body.bookingFor || 'self',
    recipientName: body.recipientName || null,
    recipientPhone: body.recipientPhone || null,
    isScheduled,
    scheduledAt,
    serviceType: body.serviceType || 'food',
    paymentMethod: body.paymentMethod || 'cash',
    vehicleType: body.vehicleType || 'bike',
    pickup: {
      address: String(pickup.address || ''),
      lat: Number(pickup.lat || 0),
      lng: Number(pickup.lng || 0)
    },
    drop: {
      address: String(drop.address || ''),
      lat: Number(drop.lat || 0),
      lng: Number(drop.lng || 0)
    },
    currentLocation: {
      address: String(pickup.address || ''),
      lat: Number(pickup.lat || 0),
      lng: Number(pickup.lng || 0)
    },
    status: 'created',
    otp,
    otpVerified: false,
    driverName: body.captainName || 'Ravi Kumar',
    driverPhone: body.captainPhone || '+91-90000-12345',
    captainId: body.captainId || null,
    notificationTarget: body.notificationTarget === 'all' ? 'all' : 'preferred',
    preferredCaptainId: body.preferredCaptainId || null,
    preferredCaptainName: body.preferredCaptainName || null,
    notification: isScheduled
      ? `Booking scheduled for ${new Date(scheduledAt).toLocaleString()}. OTP ${otp} will be used to start ride.`
      : (body.notificationTarget === 'all'
        ? `Booking confirmed. OTP ${otp} generated. Broadcast notification sent to all captains.`
        : `Booking confirmed. OTP ${otp} generated. Preferred captain will be notified.`),
    estimatedFare: body.estimatedFare !== undefined ? Number(body.estimatedFare) : null,
    rideNotes: body.rideNotes || null,
    sosTriggered: false,
    sosByRole: null,
    feedbackSubmitted: false,
    feedbackSubmittedAt: null,
    feedbackText: null,
    rideRating: null,
    captainRating: null,
    lovedRide: false,
    lovedCaptain: false,
    finalAmount: null,
    paymentDone: false,
    paymentDoneAt: null,
    trackingClosed: false,
    trackingClosedAt: null,
    createdAt: now,
    updatedAt: now
  };

  insertBookingRecord(booking);
  const created = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.status(201).json(mapBookingRow(created));
});

app.post('/api/bookings/:bookingId/verify-otp', requireSession, (req, res) => {
  const { otp } = req.body || {};
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  if (String(booking.otp || '').trim() !== String(otp || '').trim()) {
    return res.status(400).json({ error: 'Invalid OTP.' });
  }

  run(
    `UPDATE bookings
     SET otp_verified = 1, status = 'assigned', notification = ?, updated_at = ?
     WHERE id = ?`,
    ['Ride started. OTP verified successfully. Captain is on the way.', nowIso(), booking.id]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

app.post('/api/bookings/:bookingId/approve', requireSession, (req, res) => {
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  if (booking.status !== 'created') {
    return res.status(400).json({ error: 'Captain approval is only available before ride start.' });
  }

  run(
    `UPDATE bookings
     SET status = 'assigned', notification = ?, updated_at = ?
     WHERE id = ?`,
    ['Ride started. Captain approved the trip and is on the way.', nowIso(), booking.id]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

app.post('/api/bookings/:bookingId/cancel', requireSession, (req, res) => {
  const { role } = req.body || {};
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return res.status(400).json({ error: 'This ride can no longer be cancelled.' });
  }

  const cancelledBy = role === 'captain' ? 'captain' : 'customer';
  run(
    `UPDATE bookings
     SET status = 'cancelled', notification = ?, updated_at = ?
     WHERE id = ?`,
    [`Ride cancelled by ${cancelledBy}.`, nowIso(), booking.id]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

app.post('/api/bookings/:bookingId/sos', requireSession, (req, res) => {
  const { role } = req.body || {};
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  const triggeredBy = role === 'captain' ? 'captain' : 'customer';
  run(
    `UPDATE bookings
     SET sos_triggered = 1, sos_by_role = ?, notification = ?, updated_at = ?
     WHERE id = ?`,
    [
      triggeredBy,
      `SOS triggered by ${triggeredBy}. Emergency support alerted and captain/customer informed.`,
      nowIso(),
      booking.id
    ]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

app.post('/api/bookings/:bookingId/feedback', requireSession, (req, res) => {
  const {
    rideRating,
    captainRating,
    feedbackText,
    lovedRide,
    lovedCaptain
  } = req.body || {};

  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  run(
    `UPDATE bookings
     SET feedback_submitted = 1,
         feedback_submitted_at = ?,
         ride_rating = ?,
         captain_rating = ?,
         feedback_text = ?,
         loved_ride = ?,
         loved_captain = ?,
         notification = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      nowIso(),
      Number(rideRating || 0),
      Number(captainRating || 0),
      String(feedbackText || '').trim() || null,
      lovedRide ? 1 : 0,
      lovedCaptain ? 1 : 0,
      'Thank you! Customer feedback and ratings submitted successfully.',
      nowIso(),
      booking.id
    ]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

app.post('/api/bookings/:bookingId/pay', requireSession, (req, res) => {
  const { amount } = req.body || {};
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  if (booking.status !== 'completed') {
    return res.status(400).json({ error: 'Payment is available only after ride completion.' });
  }

  const finalAmount = Number(amount || booking.estimated_fare || 0);
  run(
    `UPDATE bookings
     SET final_amount = ?,
         payment_done = 1,
         payment_done_at = ?,
         notification = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      finalAmount,
      nowIso(),
      `Payment completed by customer: Rs ${finalAmount}. Captain has been notified. Please submit feedback to close tracking.`,
      nowIso(),
      booking.id
    ]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

app.post('/api/bookings/:bookingId/close-tracking', requireSession, (req, res) => {
  const booking = queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.bookingId]);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  if (!canAccessBooking(req.session, booking)) {
    return res.status(403).json({ error: 'Access denied for booking.' });
  }

  if (Number(booking.feedback_submitted || 0) !== 1) {
    return res.status(400).json({ error: 'Submit feedback before closing tracking.' });
  }

  run(
    `UPDATE bookings
     SET tracking_closed = 1,
         tracking_closed_at = ?,
         notification = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      nowIso(),
      'Tracking closed. Trip moved to booking history.',
      nowIso(),
      booking.id
    ]
  );

  const updated = queryOne('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  return res.json(mapBookingRow(updated));
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`auth-service listening on :${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize auth-service', error);
    process.exit(1);
  });
