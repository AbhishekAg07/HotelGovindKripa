const http = require("http");
const fs = require("fs");
const path = require("path");
let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

loadEnvFile();

const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 8787;
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const hotelEmail = process.env.HOTEL_EMAIL || "abhi.ag0707@gmail.com";
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
  pass: process.env.SMTP_PASS || ""
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

ensureDataStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
    const route = url.pathname;

    if (route.startsWith("/api/")) {
      applyCors(res);
    }

    if (req.method === "OPTIONS" && route.startsWith("/api/")) {
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "POST" && route === "/api/bookings") {
      const payload = await readJsonBody(req);
      const validation = validateBooking(payload);
      if (!validation.valid) {
        return sendJson(res, 400, { ok: false, message: validation.message });
      }

      const record = {
        id: createId("booking"),
        createdAt: new Date().toISOString(),
        status: "new",
        ...payload
      };

      appendRecord(files.bookings, record);
      const emailResult = await sendBookingEmail(record);
      if (!emailResult.ok) {
        return sendJson(res, 503, {
          ok: false,
          message: "Booking was received, but we could not notify the hotel right now. Please call us directly at +91 73550 78784."
        });
      }

      return sendJson(res, 201, {
        ok: true,
        message: "Booking sent successfully. We will get back to you soon."
      });
    }

    if (req.method === "POST" && route === "/api/inquiries") {
      const payload = await readJsonBody(req);
      const validation = validateInquiry(payload);
      if (!validation.valid) {
        return sendJson(res, 400, { ok: false, message: validation.message });
      }

      const record = {
        id: createId("inquiry"),
        createdAt: new Date().toISOString(),
        status: "new",
        ...payload
      };

      appendRecord(files.inquiries, record);
      const emailResult = await sendInquiryEmail(record);
      if (!emailResult.ok) {
        return sendJson(res, 503, {
          ok: false,
          message: "Inquiry was received, but we could not notify the hotel right now. Please call us directly at +91 73550 78784."
        });
      }

      return sendJson(res, 201, {
        ok: true,
        message: "Inquiry sent successfully. We will get back to you soon."
      });
    }

    if (req.method === "GET" && route === "/api/menu-items") {
      return sendJson(res, 200, readRecords(files.menuItems));
    }

    if (req.method === "GET" && route === "/api/health") {
      return sendJson(res, 200, { ok: true, message: "Server is running." });
    }

    serveStaticFile(route, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, message: "Internal server error." });
  }
});

server.listen(port, host, () => {
  console.log(`Hotel Govind Kripa server running at http://${host}:${port}`);
  if (transporter) {
    console.log(`Automatic email notifications are enabled for ${hotelEmail}`);
  } else {
    console.log("Automatic email notifications are disabled. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and HOTEL_EMAIL to enable them.");
  }
});

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

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
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

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
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

  if (!/^\d{10}$/.test(String(payload.phone).trim())) {
    return { valid: false, message: "Phone number must be exactly 10 digits." };
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

  if (!/^\d{10}$/.test(String(payload.phone).trim())) {
    return { valid: false, message: "Phone number must be exactly 10 digits." };
  }

  return { valid: true };
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createMailTransporter() {
  if (!nodemailer || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    }
  });
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

  return sendEmail(subject, text);
}

async function sendEmail(subject, text) {
  if (!transporter) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    await transporter.sendMail({
      from: smtpConfig.user,
      to: hotelEmail,
      replyTo: smtpConfig.user,
      subject,
      text
    });
    return { ok: true };
  } catch (error) {
    console.error("Email delivery failed:", error);
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

function readRecords(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeRecords(filePath, records) {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf8");
}

function serveStaticFile(route, res) {
  const requestPath = route === "/" ? "/index.html" : route;
  const relativePath = requestPath.replace(/^\/+/, "");
  const safePath = path.normalize(relativePath);
  const filePath = path.resolve(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        return sendText(res, 404, "Not found");
      }
      return sendText(res, 500, "Internal server error");
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}
