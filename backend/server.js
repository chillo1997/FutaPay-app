// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { createMollieClient } from "@mollie/api-client";
import admin from "firebase-admin";

const app = express();

/* --------------------------
   Middleware
-------------------------- */
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));

/* --------------------------
   Basics
-------------------------- */
const PORT = process.env.PORT || 10000;

app.get("/version", (req, res) => {
  res.json({ ok: true, version: "server-v1", ts: new Date().toISOString() });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "futapay-backend", ts: new Date().toISOString() });
});

/* --------------------------
   Firebase Admin
-------------------------- */
function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON. Add it in Render env vars.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

function firestore() {
  initFirebaseAdmin();
  return admin.firestore();
}

/* --------------------------
   Mollie
-------------------------- */
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://futapay-app1.onrender.com";

const mollie = MOLLIE_API_KEY ? createMollieClient({ apiKey: MOLLIE_API_KEY }) : null;

function requireMollie(res) {
  if (!MOLLIE_API_KEY || !mollie) {
    res.status(500).json({ ok: false, error: "Missing MOLLIE_API_KEY on backend." });
    return false;
  }
  return true;
}

function toMollieValue(amount) {
  const n = Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

app.post("/mollie/payments", async (req, res) => {
  try {
    if (!requireMollie(res)) return;

    const { amount, description, redirectUrl, metadata } = req.body || {};
    const value = toMollieValue(amount);
    if (!value) return res.status(400).json({ ok: false, error: "Invalid amount." });

    const txId = metadata?.txId || metadata?.txid;
    const uid = metadata?.uid;
    if (!txId || !uid) {
      return res.status(400).json({ ok: false, error: "Missing metadata.uid or metadata.txId" });
    }

    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value },
      description: description || "FutaPay transfer",
      redirectUrl: redirectUrl || `${PUBLIC_BASE_URL}/mollie/return`,
      webhookUrl: `${PUBLIC_BASE_URL}/webhooks/mollie`,
      metadata: { ...(metadata || {}), uid, txId },
    });

    return res.json({
      ok: true,
      paymentId: payment.id,
      checkoutUrl: payment?._links?.checkout?.href,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/webhooks/mollie", async (req, res) => {
  try {
    if (!requireMollie(res)) return res.status(200).send("ok");

    const paymentId = req.body?.id || req.query?.id;
    console.log("✅ Mollie webhook hit:", { body: req.body, paymentId });

    if (!paymentId) return res.status(200).send("ok");

    const payment = await mollie.payments.get(String(paymentId));
    const status = payment?.status;

    const uid = payment?.metadata?.uid;
    const txId = payment?.metadata?.txId || payment?.metadata?.txid;

    console.log("✅ Mollie payment fetched:", { paymentId: payment?.id, status, uid, txId });

    if (!uid || !txId) return res.status(200).send("ok");

    const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);

    let newStatus = "payment_open";
    if (status === "paid" || status === "authorized") newStatus = "paid";
    else if (status === "failed") newStatus = "failed";
    else if (status === "expired") newStatus = "expired";
    else if (status === "canceled") newStatus = "canceled";
    else if (status === "pending") newStatus = "pending";

    await txRef.set(
      {
        status: newStatus,
        molliePaymentId: payment.id,
        mollieStatus: status,
        molliePaidAt: newStatus === "paid" ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("✅ Firestore updated:", { path: txRef.path, newStatus, mollieStatus: status });
    return res.status(200).send("ok");
  } catch (err) {
    console.log("❌ Mollie webhook error:", err?.message || String(err));
    return res.status(200).send("ok");
  }
});

app.get("/mollie/return", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(`<html><body style="font-family:system-ui;padding:24px;"><h2>Thanks — return to the app.</h2></body></html>`);
});

/* --------------------------
   pawaPay
-------------------------- */
const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || "https://api.sandbox.pawapay.io";
const PAWAPAY_TOKEN = (process.env.PAWAPAY_TOKEN || "").trim();

const PAWAPAY_PAYOUT_MAP_COLLECTION = "pawapay_payouts";

function requirePawaPayToken(res) {
  if (!PAWAPAY_TOKEN) {
    res.status(500).json({ ok: false, error: "Missing PAWAPAY_TOKEN on backend." });
    return false;
  }
  return true;
}

async function pawaPayFetch(path, { method = "GET", body } = {}) {
  const url = `${PAWAPAY_BASE_URL}${path}`;
  const headers = { Authorization: `Bearer ${PAWAPAY_TOKEN}`, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";

  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: r.ok, status: r.status, data };
}

function digitsOnly(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function normalizeProvider({ provider, countryIso3 }) {
  const p = String(provider || "").trim();

  // already a provider code
  if (p.includes("_")) return p;

  const iso3 = String(countryIso3 || "").toUpperCase().trim();

  // Minimal mapping for your current sandbox corridor (Zambia)
  if (iso3 === "ZMB") {
    const map = {
      "MTN MOMO": "MTN_MOMO_ZMB",
      "MTN MOMO ZMB": "MTN_MOMO_ZMB",
      "MTN": "MTN_MOMO_ZMB",
      "AIRTEL MONEY": "AIRTEL_MONEY_ZMB",
      "ZAMTEL MONEY": "ZAMTEL_MONEY_ZMB",
    };
    const key = p.toUpperCase();
    return map[key] || null;
  }

  // other countries: require code (until you expand mapping)
  return null;
}

function normalizeMsisdn({ phoneNumber, countryIso3 }) {
  const iso3 = String(countryIso3 || "").toUpperCase().trim();
  const d = digitsOnly(phoneNumber);

  // Zambia: must be 260 + 9 digits = 12 digits total (example: 260971234567)
  if (iso3 === "ZMB") {
    if (!d.startsWith("260")) return { ok: false, error: "ZMB MSISDN must start with 260" };
    if (d.length !== 12) return { ok: false, error: "ZMB MSISDN must be 12 digits (260 + 9 digits)" };
    return { ok: true, msisdn: d };
  }

  // default: pass digits only
  if (!d) return { ok: false, error: "Invalid phone number" };
  return { ok: true, msisdn: d };
}

/**
 * Payout request
 */
app.post("/pawapay/payouts", async (req, res) => {
  try {
    if (!requirePawaPayToken(res)) return;

    const {
      uid,
      txId,
      provider,
      phoneNumber,
      amount,
      currency = "ZMW",
      countryIso3 = "ZMB",
      customerMessage = "FutaPay payout test",
    } = req.body || {};

    console.log("➡️ /pawapay/payouts called:", { uid, txId, provider, phoneNumber, amount, currency, countryIso3 });

    if (!uid || !txId) return res.status(400).json({ ok: false, error: "Missing uid or txId" });
    if (!provider || !phoneNumber || !amount) {
      return res.status(400).json({ ok: false, error: "Missing provider, phoneNumber or amount" });
    }

    const providerCode = normalizeProvider({ provider, countryIso3 });
    if (!providerCode) {
      return res.status(400).json({
        ok: false,
        error: `Invalid provider for ${countryIso3}. Send a provider code like MTN_MOMO_ZMB (not '${provider}').`,
      });
    }

    const msisdnRes = normalizeMsisdn({ phoneNumber, countryIso3 });
    if (!msisdnRes.ok) {
      return res.status(400).json({ ok: false, error: msisdnRes.error });
    }

    const payoutId = crypto.randomUUID();

    const payload = {
      payoutId,
      amount: String(amount),
      currency,
      recipient: {
        type: "MMO",
        accountDetails: {
          provider: providerCode,
          phoneNumber: msisdnRes.msisdn,
        },
      },
      customerMessage,
    };

    const result = await pawaPayFetch("/v2/payouts", { method: "POST", body: payload });

    const db = firestore();
    const txPath = `users/${uid}/transactions/${txId}`;
    const txRef = db.doc(txPath);

    // Option B mapping doc
    await db.doc(`${PAWAPAY_PAYOUT_MAP_COLLECTION}/${payoutId}`).set(
      { payoutId, uid, txId, txPath, createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    await txRef.set(
      {
        payoutProviderCode: providerCode,
        payoutPhoneNumber: msisdnRes.msisdn,
        pawaPay: {
          payoutId,
          providerUsed: providerCode,
          phoneNumberUsed: msisdnRes.msisdn,
          request: payload,
          lastResponse: result.data,
          lastHttpStatus: result.status,
          status: result.ok ? (result.data?.status || "ACCEPTED") : "REQUEST_FAILED",
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: "pawaPay payout creation failed",
        details: result.data,
        payoutId,
      });
    }

    return res.json({ ok: true, payoutId, raw: result.data });
  } catch (err) {
    console.log("❌ /pawapay/payouts error:", err?.message || String(err));
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/* --------------------------
   pawaPay callbacks (Option B direct lookup)
-------------------------- */
function mapPawaPayStatusToInternal(status) {
  const s = String(status || "").toUpperCase();
  if (["ACCEPTED", "ENQUEUED", "PENDING", "PROCESSING"].includes(s)) return "payout_processing";
  if (["COMPLETED", "SUCCESSFUL", "SUCCESS"].includes(s)) return "payout_completed";
  if (["FAILED", "REJECTED", "CANCELLED", "CANCELED", "EXPIRED"].includes(s)) return "payout_failed";
  return "payout_unknown";
}

app.post("/webhooks/pawapay", async (req, res) => {
  try {
    const event = req.body || {};

    const payoutId =
      event?.payoutId ||
      event?.payoutID ||
      event?.payout?.payoutId ||
      event?.payout?.payoutID;

    const status =
      event?.status ||
      event?.payoutStatus ||
      event?.payout?.status ||
      event?.payout?.payoutStatus;

    console.log("✅ pawaPay callback received:", JSON.stringify(event));

    if (!payoutId || !status) return res.status(200).send("ok");

    const internal = mapPawaPayStatusToInternal(status);

    const db = firestore();
    const mapRef = db.doc(`${PAWAPAY_PAYOUT_MAP_COLLECTION}/${String(payoutId)}`);
    const mapSnap = await mapRef.get();

    if (!mapSnap.exists) {
      console.log("⚠️ No payout mapping found for payoutId:", payoutId);
      return res.status(200).send("ok");
    }

    const { txPath } = mapSnap.data() || {};
    if (!txPath) {
      console.log("⚠️ payout mapping missing txPath:", payoutId);
      return res.status(200).send("ok");
    }

    const txRef = db.doc(String(txPath));
    const txSnap = await txRef.get();
    const existing = txSnap.exists ? txSnap.data() : {};
    const existingPawaPay = existing?.pawaPay || {};

    await txRef.set(
      {
        status: internal,
        pawaPay: {
          ...existingPawaPay,
          status: String(status),
          lastCallback: event,
          callbackReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("✅ pawaPay webhook updated tx:", { txPath, payoutId, status, internal });
    return res.status(200).send("ok");
  } catch (err) {
    console.log("❌ pawaPay webhook error:", { code: err?.code, message: err?.message, stack: err?.stack });
    return res.status(200).send("ok");
  }
});

/* --------------------------
   Start
-------------------------- */
app.listen(PORT, () => {
  console.log("✅ Server listening on port", PORT);
  console.log("✅ PUBLIC_BASE_URL =", PUBLIC_BASE_URL);
});
