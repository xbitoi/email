import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import Database from "better-sqlite3";
import cron from "node-cron";
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("scheduler.db");

app.use(cors());
app.use(express.json());

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expiry_date INTEGER
  );
  CREATE TABLE IF NOT EXISTS scheduled_emails (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    recipient TEXT,
    subject TEXT,
    body TEXT,
    scheduled_at TEXT,
    recurrence TEXT DEFAULT 'none', -- none, daily, weekly, monthly
    recurrence_days TEXT, -- comma separated days for weekly (0-6)
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    error TEXT
  );
`);

// Ensure recurrence columns exist (for existing databases)
try { db.exec("ALTER TABLE scheduled_emails ADD COLUMN recurrence TEXT DEFAULT 'none'"); } catch (e) {}
try { db.exec("ALTER TABLE scheduled_emails ADD COLUMN recurrence_days TEXT"); } catch (e) {}

// Helper to get config
const getConfig = (key: string) => {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as any;
  return row ? row.value : process.env[key];
};

// Config Routes
app.get("/api/debug/info", (req, res) => {
  const host = req.get("host");
  let protocol = req.protocol;
  if (host && !host.includes("localhost")) {
    protocol = "https";
  }
  
  const clientOrigin = req.query.origin as string;
  const origin = clientOrigin || process.env.APP_URL?.replace(/\/$/, "") || `${protocol}://${host}`;
  const redirectUri = `${origin}/auth/callback`;
  
  res.json({
    detected_origin: origin,
    detected_redirect_uri: redirectUri,
    has_client_id: !!getConfig("GOOGLE_CLIENT_ID"),
    has_client_secret: !!getConfig("GOOGLE_CLIENT_SECRET"),
    client_id_prefix: getConfig("GOOGLE_CLIENT_ID")?.substring(0, 10) + "..."
  });
});

app.get("/api/config", (req, res) => {
  const clientId = db.prepare("SELECT value FROM config WHERE key = 'GOOGLE_CLIENT_ID'").get() as any;
  const clientSecret = db.prepare("SELECT value FROM config WHERE key = 'GOOGLE_CLIENT_SECRET'").get() as any;
  res.json({
    GOOGLE_CLIENT_ID: clientId ? clientId.value : "",
    GOOGLE_CLIENT_SECRET: clientSecret ? clientSecret.value : ""
  });
});

app.post("/api/config", (req, res) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = req.body;
  try {
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID);
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run("GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save configuration" });
  }
});

// Auth Routes
app.get("/api/auth/url", (req, res) => {
  try {
    const clientId = getConfig("GOOGLE_CLIENT_ID")?.trim();
    const clientSecret = getConfig("GOOGLE_CLIENT_SECRET")?.trim();

    console.log("Generating OAuth URL with:");
    console.log("Client ID:", clientId ? "Set" : "Not Set");
    
    if (!clientId || !clientSecret) {
      return res.status(400).json({ 
        error: "Missing Google OAuth Credentials. Please set them in Settings." 
      });
    }

    const host = req.get("host");
    let protocol = req.protocol;
    if (host && !host.includes("localhost")) {
      protocol = "https";
    }
    
    // Prioritize origin from query (client-side), then APP_URL, then detection
    const clientOrigin = req.query.origin as string;
    const origin = clientOrigin || process.env.APP_URL?.replace(/\/$/, "") || `${protocol}://${host}`;
    const redirectUri = `${origin}/auth/callback`;
    
    console.log("Redirect URI being sent to Google:", redirectUri);
    console.log("Origin detected/received:", origin);
    
    const client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      prompt: "consent select_account",
    });
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: white;">
          <div style="text-align: center; padding: 2rem; background: #18181b; border-radius: 1.5rem; border: 1px solid #27272a; max-width: 400px; width: 90%;">
            <div style="width: 60px; height: 60px; background: #ef4444; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <h1 style="color: white; margin-bottom: 0.5rem;">Access Denied</h1>
            <p style="color: #a1a1aa; margin-bottom: 2rem;">${error === 'access_denied' ? 'You cancelled the request or do not have permission.' : 'An error occurred during authentication.'}</p>
            <button onclick="window.close()" style="background: #3f3f46; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.75rem; cursor: pointer; font-weight: bold;">Close Window</button>
            <script>
              const errorData = { type: 'OAUTH_AUTH_ERROR', error: '${error}' };
              if (window.opener) {
                window.opener.postMessage(errorData, '*');
                window.close();
              } else {
                window.location.href = '/#auth_error=' + btoa(JSON.stringify(errorData));
              }
            </script>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const host = req.get("host");
    let protocol = req.protocol;
    if (host && !host.includes("localhost")) {
      protocol = "https";
    }
    // Use APP_URL if available, otherwise detect from request
    const origin = process.env.APP_URL?.replace(/\/$/, "") || `${protocol}://${host}`;
    const redirectUri = `${origin}/auth/callback`;

    const clientId = getConfig("GOOGLE_CLIENT_ID")?.trim();
    const clientSecret = getConfig("GOOGLE_CLIENT_SECRET")?.trim();

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth Credentials in database.");
    }

    const client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await client.getToken(code as string);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    const userId = userInfo.data.id;

    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, access_token, refresh_token, expiry_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email, tokens.access_token, tokens.refresh_token, tokens.expiry_date);

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: white;">
          <div style="text-align: center; padding: 2rem; background: #18181b; border-radius: 1.5rem; border: 1px solid #27272a; max-width: 400px; width: 90%;">
            <div style="width: 60px; height: 60px; background: #10b981; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h1 style="color: white; margin-bottom: 0.5rem;">Connected!</h1>
            <p style="color: #a1a1aa; margin-bottom: 2rem;">Your Gmail account has been linked successfully. You can now close this window.</p>
            <button onclick="window.close()" style="background: #10b981; color: black; border: none; padding: 0.75rem 1.5rem; border-radius: 0.75rem; cursor: pointer; font-weight: bold; width: 100%;">Close Window Now</button>
            <script>
              const userData = { type: 'OAUTH_AUTH_SUCCESS', userId: '${userId}', email: '${email}' };
              if (window.opener) {
                window.opener.postMessage(userData, '*');
                window.close();
              } else {
                // Direct redirect flow: pass data via URL fragment to avoid server-side state
                window.location.href = '/#auth_success=' + btoa(JSON.stringify(userData));
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Email Routes
app.post("/api/schedule", (req, res) => {
  const { userId, recipient, subject, body, scheduledAt, recurrence, recurrenceDays } = req.body;
  const id = Math.random().toString(36).substring(7);
  try {
    db.prepare(`
      INSERT INTO scheduled_emails (id, user_id, recipient, subject, body, scheduled_at, recurrence, recurrence_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, recipient, subject, body, scheduledAt, recurrence || 'none', recurrenceDays || null);
    res.json({ success: true, id });
  } catch (error) {
    console.error("Schedule error:", error);
    res.status(500).json({ error: "Failed to schedule email" });
  }
});

app.get("/api/scheduled/:userId", (req, res) => {
  const emails = db.prepare("SELECT * FROM scheduled_emails WHERE user_id = ? ORDER BY scheduled_at ASC").all(req.params.userId);
  res.json(emails);
});

app.delete("/api/scheduled/:id", (req, res) => {
  db.prepare("DELETE FROM scheduled_emails WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Background Worker
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const nowIso = now.toISOString();
  const pending = db.prepare("SELECT * FROM scheduled_emails WHERE status = 'pending' AND scheduled_at <= ?").all(nowIso);

  const clientId = getConfig("GOOGLE_CLIENT_ID");
  const clientSecret = getConfig("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) return;

  for (const email of pending as any[]) {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(email.user_id) as any;
    if (!user) continue;

    try {
      const auth = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials({
        access_token: user.access_token,
        refresh_token: user.refresh_token,
        expiry_date: user.expiry_date,
      });

      const gmail = google.gmail({ version: "v1", auth });
      const utf8Subject = `=?utf-8?B?${Buffer.from(email.subject).toString("base64")}?=`;
      const messageParts = [
        `To: ${email.recipient}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        `Subject: ${utf8Subject}`,
        "",
        email.body,
      ];
      const message = messageParts.join("\n");
      const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });

      console.log(`Sent email to ${email.recipient}`);

      if (email.recurrence && email.recurrence !== 'none') {
        // Mark current as sent
        db.prepare("UPDATE scheduled_emails SET status = 'sent', sent_at = ? WHERE id = ?")
          .run(new Date().toISOString(), email.id);

        // Calculate next occurrence
        const nextDate = new Date(email.scheduled_at);
        if (email.recurrence === 'daily') {
          nextDate.setDate(nextDate.getDate() + 1);
        } else if (email.recurrence === 'weekly') {
          nextDate.setDate(nextDate.getDate() + 7);
        } else if (email.recurrence === 'monthly') {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        
        // Create NEW record for next occurrence
        const nextId = Math.random().toString(36).substring(7);
        db.prepare(`
          INSERT INTO scheduled_emails (id, user_id, recipient, subject, body, scheduled_at, recurrence, recurrence_days)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(nextId, email.user_id, email.recipient, email.subject, email.body, nextDate.toISOString(), email.recurrence, email.recurrence_days);
      } else {
        db.prepare("UPDATE scheduled_emails SET status = 'sent', sent_at = ? WHERE id = ?")
          .run(new Date().toISOString(), email.id);
      }
    } catch (error: any) {
      console.error(`Failed to send email ${email.id}:`, error);
      db.prepare("UPDATE scheduled_emails SET status = 'failed', error = ? WHERE id = ?").run(error.message, email.id);
    }
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback to index.html for SPA
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
