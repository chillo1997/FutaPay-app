import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { createMollieClient } from "@mollie/api-client";
import admin from "firebase-admin";

const app = express();

// Mollie webhooks often POST as x-www-form-urlencoded, so accept both:
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));
app.get("/version", (req, res) => {
  res.json({ ok: true, version: "mollie-v1", ts: new Date().toISOString() });
});


const PORT = process.env.PORT || 10000;

/* --------------------------
   Firebase Admin (Backend)
-------------------------- */

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON. Add your Firebase service account JSON as a Render env var."
    );
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
    res.status(500).json({
      ok: false,
      error: "Missing MOLLIE_API_KEY on backend. Add it in Render env vars and redeploy.",
    });
    return false;
  }
  return true;
}

function toMollieValue(amount) {
  const n = Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

// Create Mollie payment
app.post("/mollie/payments", async (req, res) => {
  try {
    if (!requireMollie(res)) return;

    const { amount, description, redirectUrl, metadata } = req.body || {};
    const value = toMollieValue(amount);

    if (!value) {
      return res.status(400).json({ ok: false, error: "Invalid amount. Use e.g. '10.00'." });
    }

    const txId = metadata?.txId;
    const uid = metadata?.uid;

    if (!txId || !uid) {
      return res.status(400).json({
        ok: false,
        error: "Missing metadata.uid or metadata.txId (needed for webhook to update Firestore).",
      });
    }

    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value },
      description: description || "FutaPay transfer",
      redirectUrl: redirectUrl || `${PUBLIC_BASE_URL}/mollie/return`,
      webhookUrl: `${PUBLIC_BASE_URL}/webhooks/mollie`,
      metadata: { ...metadata, uid, txId },
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

// Mollie webhook
app.post("/webhooks/mollie", async (req, res) => {
  try {
    if (!requireMollie(res)) return res.status(200).send("ok");

    const paymentId = req.body?.id;
    if (!paymentId) return res.status(200).send("ok");

    const payment = await mollie.payments.get(paymentId);

    const uid = payment?.metadata?.uid;
    const txId = payment?.metadata?.txId;
    if (!uid || !txId) return res.status(200).send("ok");

    const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);
    const status = payment.status;

    let newStatus = "payment_open";
    if (status === "paid") newStatus = "paid";
    else if (status === "failed") newStatus = "failed";
    else if (status === "expired") newStatus = "expired";
    else if (status === "canceled") newStatus = "canceled";
    else if (status === "pending") newStatus = "pending";

    await txRef.set(
      {
        status: newStatus,
        molliePaymentId: payment.id,
        mollieStatus: status,
        molliePaidAt: status === "paid" ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).send("ok");
  } catch {
    return res.status(200).send("ok");
  }
});

app.get("/mollie/return", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(`
    <html><body style="font-family: system-ui; padding:24px;">
      <h2>Thanks — return to the app.</h2>
      <p>Your payment status will update shortly.</p>
    </body></html>
  `);
});

/* --------------------------
   pawaPay (your existing)
-------------------------- */

const PAWAPAY_BASE_URL = process.env.PAWAPAY_BASE_URL || "https://api.sandbox.pawapay.io";
const PAWAPAY_TOKEN = (process.env.PAWAPAY_TOKEN || "").trim();
const PAWAPAY_RETURN_URL =
  process.env.PAWAPAY_RETURN_URL ||
  (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/pawapay/return` : "https://example.com");

function requirePawaPayToken(res) {
  if (!PAWAPAY_TOKEN) {
    res.status(500).json({
      ok: false,
      error: "Missing PAWAPAY_TOKEN on the backend. Add it in Render env vars and redeploy.",
    });
    return false;
  }
  return true;
}

async function pawaPayFetch(path, { method = "GET", body } = {}) {
  const url = `${PAWAPAY_BASE_URL}${path}`;

  const headers = { Authorization: `Bearer ${PAWAPAY_TOKEN}` };
  Accept: "application/json";
  if (body) headers["Content-Type"] = "application/json";

  const r = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: r.ok, status: r.status, data };
}

function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

const store = { deposits: new Map(), payouts: new Map() };

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "futapay-backend", ts: new Date().toISOString() });
});

app.get("/pawapay/active-conf", async (req, res) => {
  if (!requirePawaPayToken(res)) return;
  const result = await pawaPayFetch("/v2/active-configuration", { method: "GET" });
  safeJson(res, result.ok ? 200 : result.status, result);
});

app.post("/pawapay/paymentpage/deposit", async (req, res) => {
  if (!requirePawaPayToken(res)) return;

  const { amount, currency = "ZMW", customerMessage = "FutaPay test", phoneNumber, returnUrl } =
    req.body || {};

  if (!amount || !phoneNumber) {
    return safeJson(res, 400, { ok: false, error: "Missing required fields: amount, phoneNumber" });
  }

  app.get("/pawapay/availability", async (req, res) => {
  if (!requirePawaPayToken(res)) return;

  const country = req.query.country || "ZMB";
  const operationType = req.query.operationType || "PAYOUT";

  const result = await pawaPayFetch(
    `/v2/availability?country=${encodeURIComponent(country)}&operationType=${encodeURIComponent(operationType)}`,
    { method: "GET" }
  );

  safeJson(res, result.ok ? 200 : result.status, result);
});


  const depositId = crypto.randomUUID();

  const payload = {
    depositId,
    amount: String(amount),
    currency,
    payer: { type: "MSISDN", address: { value: String(phoneNumber) } },
    customerMessage,
    returnUrl: returnUrl || PAWAPAY_RETURN_URL,
  };

  const result = await pawaPayFetch("/payment-page/deposits", { method: "POST", body: payload });

  store.deposits.set(depositId, {
    depositId,
    createdAt: new Date().toISOString(),
    request: payload,
    response: result.data,
    status: "PENDING",
  });

  if (!result.ok) {
    return safeJson(res, result.status, { ok: false, error: "pawaPay deposit creation failed", details: result.data });
  }

  const redirectUrl =
    result.data?.redirectUrl ||
    result.data?._links?.redirect?.href ||
    result.data?._links?.paymentPage?.href ||
    null;

  return safeJson(res, 200, { ok: true, depositId, redirectUrl, raw: result.data });
});

app.get("/pawapay/return", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(`
    <html><body style="font-family: system-ui; padding:24px;">
      <h2>Thanks — we received your return.</h2>
      <p>You can now go back to the app.</p>
    </body></html>
  `);
});

app.post("/pawapay/payouts", async (req, res) => {
  if (!requirePawaPayToken(res)) return;

  const { provider, phoneNumber, amount, currency = "ZMW", customerMessage = "FutaPay payout test" } =
    req.body || {};

  if (!provider || !phoneNumber || !amount) {
    return safeJson(res, 400, { ok: false, error: "Missing required fields: provider, phoneNumber, amount" });
  }

  const payoutId = crypto.randomUUID();

  const payload = {
    payoutId,
    amount: String(amount),
    currency,
    recipient: {
      type: "MMO",
      accountDetails: { provider, phoneNumber: String(phoneNumber) },
    },
    customerMessage,
  };

  const result = await pawaPayFetch("/v2/payouts", { method: "POST", body: payload });


  store.payouts.set(payoutId, {
    payoutId,
    createdAt: new Date().toISOString(),
    request: payload,
    response: result.data,
    status: "PENDING",
  });

  if (!result.ok) {
    return safeJson(res, result.status, { ok: false, error: "pawaPay payout creation failed", details: result.data });
  }

  return safeJson(res, 200, { ok: true, payoutId, raw: result.data });
});

app.get("/debug/store", (req, res) => {
  res.json({
    ok: true,
    deposits: Array.from(store.deposits.values()),
    payouts: Array.from(store.payouts.values()),
  });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}`);
  console.log(`Mollie configured: ${Boolean(MOLLIE_API_KEY)}`);
  console.log(`pawaPay base: ${PAWAPAY_BASE_URL}`);
});
