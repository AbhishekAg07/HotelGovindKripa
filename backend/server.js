const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const backendDir = __dirname;
const frontendDir = path.resolve(backendDir, "..", "frontend");
let nodemailer = null;
let MongoClient = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

try {
  ({ MongoClient } = require("mongodb"));
} catch (error) {
  MongoClient = null;
}

loadEnvFile();

const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 8787;
const dataDir = path.join(backendDir, "data");
const hotelEmail = process.env.HOTEL_EMAIL || "hotelgovindkripa@gmail.com";
const adminKey = process.env.ADMIN_KEY || "";
const mongoUri = process.env.MONGODB_URI || "";
const mongoDbName = process.env.MONGODB_DB_NAME || "hotel_govind_kripa";
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || "");
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 100000);
const rateLimitStore = new Map();
const files = {
  bookings: path.join(dataDir, "bookings.json"),
  inquiries: path.join(dataDir, "inquiries.json"),
  menuItems: path.join(dataDir, "menu-items.json")
};
const smtpConfig = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  user: process.env.SMTP_USER || "",
  pass: String(process.env.SMTP_PASS || "").replace(/\s+/g, "")
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
const transporter = createMailTransporter();
const storage = createStorage();

if (!storage.isMongo) {
  ensureDataStore();
}

const requestHandler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
    const route = url.pathname;
    setSecurityHeaders(res);

    if (route.startsWith("/api/")) {
      if (!applyCors(req, res)) {
        return sendJson(res, 403, { ok: false, message: "Origin is not allowed." });
      }
    }

    if (req.method === "OPTIONS" && route.startsWith("/api/")) {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "POST" && route === "/api/bookings") {
      if (!consumeRateLimit(req, "public-form", 10, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      const payload = await readJsonBody(req);
      const validation = validateBooking(payload);
      if (!validation.valid) {
        return sendJson(res, 400, { ok: false, message: validation.message });
      }

      const record = {
        id: createId("booking"),
        createdAt: new Date().toISOString(),
        status: "new",
        ...normalizeBooking(payload)
      };

      await storage.addBooking(record);
      sendBookingEmail(record);

      return sendJson(res, 201, {
        ok: true,
        message: "Booking received. We will get back to you soon."
      });
    }

    if (req.method === "POST" && route === "/api/inquiries") {
      if (!consumeRateLimit(req, "public-form", 10, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      const payload = await readJsonBody(req);
      const validation = validateInquiry(payload);
      if (!validation.valid) {
        return sendJson(res, 400, { ok: false, message: validation.message });
      }

      const record = {
        id: createId("inquiry"),
        createdAt: new Date().toISOString(),
        status: "new",
        ...normalizeInquiry(payload)
      };

      await storage.addInquiry(record);
      sendInquiryEmail(record);

      return sendJson(res, 201, {
        ok: true,
        message: "Inquiry received. We will get back to you soon."
      });
    }

    if (req.method === "GET" && route === "/api/menu-items") {
      return sendJson(res, 200, await storage.listMenuItems());
    }

    if (req.method === "GET" && route === "/api/bookings") {
      if (!consumeRateLimit(req, "admin", 120, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      if (!isAdminRequest(req)) {
        return sendJson(res, 401, { ok: false, message: "Unauthorized." });
      }

      return sendJson(res, 200, await storage.listBookings());
    }

    if (req.method === "GET" && route === "/api/inquiries") {
      if (!consumeRateLimit(req, "admin", 120, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      if (!isAdminRequest(req)) {
        return sendJson(res, 401, { ok: false, message: "Unauthorized." });
      }

      return sendJson(res, 200, await storage.listInquiries());
    }

    const bookingMatch = route.match(/^\/api\/bookings\/([^/]+)$/);
    if (bookingMatch && req.method === "DELETE") {
      if (!consumeRateLimit(req, "admin", 120, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      if (!isAdminRequest(req)) {
        return sendJson(res, 401, { ok: false, message: "Unauthorized." });
      }

      const bookingId = decodeURIComponent(bookingMatch[1]);
      const deleted = await storage.deleteBooking(bookingId);
      if (!deleted) {
        return sendJson(res, 404, { ok: false, message: "Booking not found." });
      }

      return sendJson(res, 200, { ok: true, message: "Booking deleted." });
    }

    const inquiryMatch = route.match(/^\/api\/inquiries\/([^/]+)$/);
    if (inquiryMatch && req.method === "DELETE") {
      if (!consumeRateLimit(req, "admin", 120, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      if (!isAdminRequest(req)) {
        return sendJson(res, 401, { ok: false, message: "Unauthorized." });
      }

      const inquiryId = decodeURIComponent(inquiryMatch[1]);
      const deleted = await storage.deleteInquiry(inquiryId);
      if (!deleted) {
        return sendJson(res, 404, { ok: false, message: "Inquiry not found." });
      }

      return sendJson(res, 200, { ok: true, message: "Inquiry deleted." });
    }

    if (req.method === "POST" && route === "/api/menu-items") {
      if (!consumeRateLimit(req, "admin", 120, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      if (!isAdminRequest(req)) {
        return sendJson(res, 401, { ok: false, message: "Unauthorized." });
      }

      const payload = await readJsonBody(req);
      const validation = validateMenuItem(payload);
      if (!validation.valid) {
        return sendJson(res, 400, { ok: false, message: validation.message });
      }

      const item = normalizeMenuItem({
        id: createId("menu"),
        createdAt: new Date().toISOString(),
        ...payload
      });

      await storage.addMenuItem(item);
      return sendJson(res, 201, { ok: true, message: "Menu item added.", item });
    }

    const menuItemMatch = route.match(/^\/api\/menu-items\/([^/]+)$/);
    if (menuItemMatch && (req.method === "PUT" || req.method === "DELETE")) {
      if (!consumeRateLimit(req, "admin", 120, 15 * 60 * 1000)) {
        return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again later." });
      }

      if (!isAdminRequest(req)) {
        return sendJson(res, 401, { ok: false, message: "Unauthorized." });
      }

      const itemId = decodeURIComponent(menuItemMatch[1]);
      const existingItem = await storage.getMenuItem(itemId);
      if (!existingItem) {
        return sendJson(res, 404, { ok: false, message: "Menu item not found." });
      }

      if (req.method === "DELETE") {
        await storage.deleteMenuItem(itemId);
        return sendJson(res, 200, { ok: true, message: "Menu item deleted." });
      }

      const payload = await readJsonBody(req);
      const validation = validateMenuItem(payload);
      if (!validation.valid) {
        return sendJson(res, 400, { ok: false, message: validation.message });
      }

      const updatedItem = normalizeMenuItem({
        ...existingItem,
        ...payload,
        updatedAt: new Date().toISOString()
      });

      await storage.updateMenuItem(itemId, updatedItem);
      return sendJson(res, 200, { ok: true, message: "Menu item updated.", item: updatedItem });
    }

    if (req.method === "GET" && route === "/api/health") {
      return sendJson(res, 200, { ok: true, message: "Server is running.", storage: storage.name });
    }

    serveStaticFile(route, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { ok: false, message: error.publicMessage || "Internal server error." });
  }
};

if (require.main === module) {
  const server = http.createServer(requestHandler);

  server.listen(port, host, () => {
    console.log(`Hotel Govind Kripa server running at http://${host}:${port}`);
    if (transporter) {
      console.log(`Automatic email notifications are enabled for ${hotelEmail}`);
    } else {
      console.log("Automatic email notifications are disabled. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and HOTEL_EMAIL to enable them.");
    }

    if (!adminKey) {
      console.log("Admin dashboard is disabled. Set ADMIN_KEY to enable protected admin APIs.");
    }

    console.log(`Data storage: ${storage.name}`);
  });
}

module.exports = requestHandler;

function ensureDataStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  Object.values(files).forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]", "utf8");
    }
  });
}

function createStorage() {
  if (mongoUri && mongoUri.includes("<")) {
    console.warn("MONGODB_URI still contains a placeholder. Replace <db_password> with your real URL-encoded MongoDB Atlas password.");
    return createFileStorage();
  }

  if (mongoUri && MongoClient) {
    return createMongoStorage();
  }

  if (mongoUri && !MongoClient) {
    console.warn("MONGODB_URI is set, but the mongodb package is not installed. Falling back to local JSON storage.");
  }

  return createFileStorage();
}

function createMongoStorage() {
  let clientPromise = null;

  async function getDb() {
    if (!clientPromise) {
      const client = new MongoClient(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000
      });

      clientPromise = client.connect().then(async (connectedClient) => {
        const db = connectedClient.db(mongoDbName);
        await Promise.all([
          db.collection("bookings").createIndex({ createdAt: -1 }),
          db.collection("inquiries").createIndex({ createdAt: -1 }),
          db.collection("menuItems").createIndex({ id: 1 }, { unique: true })
        ]);
        return db;
      });
    }

    return clientPromise;
  }

  async function list(collectionName, sort = { createdAt: -1 }) {
    const db = await getDb();
    return db.collection(collectionName)
      .find({}, { projection: { _id: 0 } })
      .sort(sort)
      .toArray();
  }

  return {
    isMongo: true,
    name: "mongodb",
    addBooking: async (record) => {
      const db = await getDb();
      await db.collection("bookings").insertOne(record);
    },
    addInquiry: async (record) => {
      const db = await getDb();
      await db.collection("inquiries").insertOne(record);
    },
    listBookings: () => list("bookings"),
    listInquiries: () => list("inquiries"),
    listMenuItems: () => list("menuItems", { createdAt: 1, name: 1 }),
    deleteBooking: async (id) => {
      const db = await getDb();
      const result = await db.collection("bookings").deleteOne({ id });
      return result.deletedCount > 0;
    },
    deleteInquiry: async (id) => {
      const db = await getDb();
      const result = await db.collection("inquiries").deleteOne({ id });
      return result.deletedCount > 0;
    },
    addMenuItem: async (item) => {
      const db = await getDb();
      await db.collection("menuItems").insertOne(item);
    },
    getMenuItem: async (id) => {
      const db = await getDb();
      return db.collection("menuItems").findOne({ id }, { projection: { _id: 0 } });
    },
    updateMenuItem: async (id, item) => {
      const db = await getDb();
      await db.collection("menuItems").updateOne({ id }, { $set: item });
    },
    deleteMenuItem: async (id) => {
      const db = await getDb();
      await db.collection("menuItems").deleteOne({ id });
    }
  };
}

function createFileStorage() {
  return {
    isMongo: false,
    name: "local-json",
    addBooking: async (record) => appendRecord(files.bookings, record),
    addInquiry: async (record) => appendRecord(files.inquiries, record),
    listBookings: async () => readRecords(files.bookings).slice().reverse(),
    listInquiries: async () => readRecords(files.inquiries).slice().reverse(),
    listMenuItems: async () => readRecords(files.menuItems),
    deleteBooking: async (id) => deleteRecordById(files.bookings, id),
    deleteInquiry: async (id) => deleteRecordById(files.inquiries, id),
    addMenuItem: async (item) => appendRecord(files.menuItems, item),
    getMenuItem: async (id) => readRecords(files.menuItems).find((item) => item.id === id) || null,
    updateMenuItem: async (id, item) => {
      const menuItems = readRecords(files.menuItems);
      const itemIndex = menuItems.findIndex((menuItem) => menuItem.id === id);
      if (itemIndex !== -1) {
        menuItems[itemIndex] = item;
        writeRecords(files.menuItems, menuItems);
      }
    },
    deleteMenuItem: async (id) => {
      const menuItems = readRecords(files.menuItems).filter((item) => item.id !== id);
      writeRecords(files.menuItems, menuItems);
    }
  };
}

function loadEnvFile() {
  const envPath = path.join(backendDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

function parseAllowedOrigins(value) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https://images.unsplash.com data:",
    "connect-src 'self'",
    "frame-src https://www.google.com https://maps.google.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join("; "));
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");

  if (!origin) {
    return true;
  }

  if (isSameOrigin(req, origin) || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    return true;
  }

  return false;
}

function isSameOrigin(req, origin) {
  try {
    const originUrl = new URL(origin);
    return originUrl.host === req.headers.host;
  } catch (error) {
    return false;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        error.publicMessage = "Request body is too large.";
        req.destroy();
        reject(error);
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        error.statusCode = 400;
        error.publicMessage = "Request body must be valid JSON.";
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function validateBooking(payload) {
  const requiredFields = ["name", "phone", "checkin", "checkout", "guests", "roomType"];
  const missingField = requiredFields.find((field) => !String(payload[field] || "").trim());
  if (missingField) {
    return { valid: false, message: `Missing booking field: ${missingField}` };
  }

  if (!isLengthBetween(payload.name, 2, 80)) {
    return { valid: false, message: "Guest name must be between 2 and 80 characters." };
  }

  if (!/^\d{10}$/.test(String(payload.phone).trim())) {
    return { valid: false, message: "Phone number must be exactly 10 digits." };
  }

  if (!["1", "2", "3", "4"].includes(String(payload.guests).trim())) {
    return { valid: false, message: "Guests must be between 1 and 4." };
  }

  if (!["Non-AC Room - Rs 1500", "AC Room - Rs 2000"].includes(String(payload.roomType).trim())) {
    return { valid: false, message: "Please choose a valid room type." };
  }

  if (!isValidDateString(payload.checkin) || !isValidDateString(payload.checkout)) {
    return { valid: false, message: "Booking dates must be valid." };
  }

  const today = getTodayDateString();
  if (String(payload.checkin).trim() < today) {
    return { valid: false, message: "Check-in date cannot be before today." };
  }

  if (payload.checkout <= payload.checkin) {
    return { valid: false, message: "Check-out date must be after check-in date." };
  }

  return { valid: true };
}

function validateInquiry(payload) {
  const requiredFields = ["name", "phone", "email", "message"];
  const missingField = requiredFields.find((field) => !String(payload[field] || "").trim());
  if (missingField) {
    return { valid: false, message: `Missing inquiry field: ${missingField}` };
  }

  if (!isLengthBetween(payload.name, 2, 80)) {
    return { valid: false, message: "Name must be between 2 and 80 characters." };
  }

  if (!/^\d{10}$/.test(String(payload.phone).trim())) {
    return { valid: false, message: "Phone number must be exactly 10 digits." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email).trim()) || !isLengthBetween(payload.email, 5, 120)) {
    return { valid: false, message: "Please enter a valid email address." };
  }

  if (!isLengthBetween(payload.message, 10, 1000)) {
    return { valid: false, message: "Message must be between 10 and 1000 characters." };
  }

  return { valid: true };
}

function validateMenuItem(payload) {
  const requiredFields = ["name", "category", "description", "price"];
  const missingField = requiredFields.find((field) => !String(payload[field] || "").trim());
  if (missingField) {
    return { valid: false, message: `Missing menu field: ${missingField}` };
  }

  if (!isLengthBetween(payload.name, 2, 100)) {
    return { valid: false, message: "Dish name must be between 2 and 100 characters." };
  }

  if (!isLengthBetween(payload.description, 5, 300)) {
    return { valid: false, message: "Description must be between 5 and 300 characters." };
  }

  if (!["veg", "nonveg"].includes(String(payload.category).trim())) {
    return { valid: false, message: "Menu category must be veg or nonveg." };
  }

  const price = Number(payload.price);
  if (!Number.isFinite(price) || price < 0) {
    return { valid: false, message: "Menu price must be a valid amount." };
  }

  return { valid: true };
}

function normalizeBooking(payload) {
  return {
    name: cleanText(payload.name),
    phone: cleanText(payload.phone),
    checkin: cleanText(payload.checkin),
    checkout: cleanText(payload.checkout),
    guests: cleanText(payload.guests),
    roomType: cleanText(payload.roomType)
  };
}

function normalizeInquiry(payload) {
  return {
    name: cleanText(payload.name),
    phone: cleanText(payload.phone),
    email: cleanText(payload.email).toLowerCase(),
    message: cleanText(payload.message)
  };
}

function normalizeMenuItem(item) {
  return {
    id: String(item.id),
    name: cleanText(item.name),
    category: cleanText(item.category),
    description: cleanText(item.description),
    price: Number(item.price),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function isAdminRequest(req) {
  const providedKey = String(req.headers["x-admin-key"] || "");
  if (!adminKey || !providedKey || providedKey.length !== adminKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(adminKey));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isLengthBetween(value, min, max) {
  const length = cleanText(value).length;
  return length >= min && length <= max;
}

function isValidDateString(value) {
  const dateString = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const date = new Date(`${dateString}T00:00:00`);
  return !Number.isNaN(date.getTime()) && dateString === [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function consumeRateLimit(req, bucket, limit, windowMs) {
  const key = `${bucket}:${getClientIp(req)}`;
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.expiresAt <= now) {
    rateLimitStore.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  current.count += 1;
  return current.count <= limit;
}

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.socket.remoteAddress || "unknown";
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMailTransporter() {
  if (!nodemailer || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    console.warn("Email transporter is not configured. Check SMTP_HOST, SMTP_USER, and SMTP_PASS.");
    return null;
  }

  const mailTransporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    }
  });

  mailTransporter.verify((error) => {
    if (error) {
      console.error("Email transporter verification failed:", error.message);
      return;
    }

    console.log("Email transporter verified successfully.");
  });

  return mailTransporter;
}

async function sendBookingEmail(record) {
  const subject = `New Room Booking - ${record.name}`;
  const text = [
    "A new room booking has been submitted.",
    "",
    `Name: ${record.name}`,
    `Phone: ${record.phone}`,
    `Check-in: ${record.checkin}`,
    `Check-out: ${record.checkout}`,
    `Guests: ${record.guests}`,
    `Room type: ${record.roomType}`,
    `Created at: ${record.createdAt}`
  ].join("\n");

  return sendEmail(subject, text);
}

async function sendInquiryEmail(record) {
  const subject = `New Inquiry - ${record.name}`;
  const text = [
    "A new inquiry has been submitted.",
    "",
    `Name: ${record.name}`,
    `Phone: ${record.phone}`,
    `Email: ${record.email}`,
    `Message: ${record.message}`,
    `Created at: ${record.createdAt}`
  ].join("\n");

  return sendEmail(subject, text, record.email);
}

async function sendEmail(subject, text, replyTo = smtpConfig.user) {
  if (!transporter) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    await transporter.sendMail({
      from: smtpConfig.user,
      to: hotelEmail,
      replyTo,
      subject,
      text
    });
    console.log(`Email notification sent: ${subject}`);
    return { ok: true };
  } catch (error) {
    console.error("Email delivery failed:", error.message);
    return { ok: false, reason: "send_failed" };
  }
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function appendRecord(filePath, record) {
  const items = readRecords(filePath);
  items.push(record);
  writeRecords(filePath, items);
}

function deleteRecordById(filePath, id) {
  const items = readRecords(filePath);
  const nextItems = items.filter((item) => item.id !== id);
  if (nextItems.length === items.length) {
    return false;
  }

  writeRecords(filePath, nextItems);
  return true;
}

function readRecords(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeRecords(filePath, records) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function serveStaticFile(route, res) {
  const requestPath = route === "/" ? "/index.html" : route;
  const relativePath = requestPath.replace(/^\/+/, "");
  const safePath = path.normalize(relativePath);
  const filePath = path.resolve(frontendDir, safePath);
  const relativeToFrontend = path.relative(frontendDir, filePath);

  if (relativeToFrontend.startsWith("..") || path.isAbsolute(relativeToFrontend)) {
    return sendText(res, 403, "Forbidden");
  }

  if (!isPublicStaticPath(relativeToFrontend)) {
    return sendText(res, 404, "Not found");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        return sendText(res, 404, "Not found");
      }
      return sendText(res, 500, "Internal server error");
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": getCacheControlHeader(ext)
    });
    res.end(data);
  });
}

function isPublicStaticPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const firstSegment = normalized.split("/")[0];
  const fileName = path.basename(normalized);
  const ext = path.extname(normalized).toLowerCase();
  const allowedRootFiles = new Set(["index.html", "admin.html", "style.css", "script.js", "admin.js", "config.js"]);
  const blockedSegments = new Set(["data", "backend", "node_modules", ".git"]);

  if (!normalized || normalized.includes("\0") || fileName.startsWith(".")) {
    return false;
  }

  if (blockedSegments.has(firstSegment)) {
    return false;
  }

  if (firstSegment === "assets") {
    return [".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"].includes(ext);
  }

  return !normalized.includes("/") && allowedRootFiles.has(normalized);
}

function getCacheControlHeader(ext) {
  if ([".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"].includes(ext)) {
    return "public, max-age=86400";
  }

  return "no-store";
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(message);
}
