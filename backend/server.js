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

// Mollie webhooks often POST as x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));

/* --------------------------
   Basics
-------------------------- */
const PORT = process.env.PORT || 10000;

app.get("/version", (req, res) => {
  res.json({ ok: true, version: "server-v2", ts: new Date().toISOString() });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "futapay-backend", ts: new Date().toISOString() });
});

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
   Helpers
-------------------------- */
function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

function normalizeDigits(input) {
  return String(input || "").replace(/[^\d]/g, "");
}

// Zambia rules (ZMB): expect 260 + 9 digits = 12 digits total, no "+"
function normalizeMsisdnForCountry(phone, iso3) {
  let msisdn = normalizeDigits(phone);

  // convert 00CC... to CC...
  if (msisdn.startsWith("00")) msisdn = msisdn.slice(2);

  if (iso3 === "ZMB") {
    // If user enters local: 0XXXXXXXXX (10 digits) => 260XXXXXXXXX
    if (msisdn.startsWith("0") && msisdn.length === 10) {
      msisdn = "260" + msisdn.slice(1);
    }
    // If user enters 2600XXXXXXXXX (extra 0) => 260XXXXXXXXX
    if (msisdn.startsWith("2600")) {
      msisdn = "260" + msisdn.slice(4);
    }
    if (!/^260\d{9}$/.test(msisdn)) {
      return {
        ok: false,
        msisdn,
        error: "Invalid Zambia MSISDN. Expected 12 digits like 260763456789.",
      };
    }
  }

  return { ok: true, msisdn };
}

// Map provider labels -> pawaPay provider codes (only what we need now)
// You can extend this per corridor later.
function resolvePawaPayProvider({ provider, iso3 }) {
  const raw = String(provider || "").trim();
  if (!raw) return { ok: false, error: "Missing provider" };

  // If caller already passes code-like value, keep it
  if (raw.includes("_")) return { ok: true, providerCode: raw };

  // Label mapping
  const key = raw.toLowerCase();

  if (iso3 === "ZMB") {
    if (key === "mtn momo" || key === "mtn") return { ok: true, providerCode: "MTN_MOMO_ZMB" };
    if (key === "airtel money" || key === "airtel") return { ok: true, providerCode: "AIRTEL_OAPI_ZMB" };
    if (key === "zamtel money" || key === "zamtel") return { ok: true, providerCode: "ZAMTEL_ZMB" };
  }

  // fallback (still try, but pawaPay may reject)
  return { ok: true, providerCode: raw };
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

    const txId = metadata?.txId || metadata?.txid;
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
      metadata: { ...metadata, uid, txId }, // always store txId
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

// Mollie webhook (updates Firestore transaction status)
app.post("/webhooks/mollie", async (req, res) => {
  try {
    if (!requireMollie(res)) return res.status(200).send("ok");

    const paymentId = req.body?.id || req.query?.id;

    console.log("✅ Mollie webhook hit:", {
      paymentId,
      contentType: req.headers["content-type"],
      body: req.body,
      ts: new Date().toISOString(),
    });

    if (!paymentId) return res.status(200).send("ok");

    const payment = await mollie.payments.get(String(paymentId));
    const mollieStatus = payment.status;

    const uid = payment?.metadata?.uid;
    const txId = payment?.metadata?.txId || payment?.metadata?.txid;

    console.log("✅ Mollie payment fetched:", {
      paymentId: payment.id,
      mollieStatus,
      uid,
      txId,
    });

    if (!uid || !txId) return res.status(200).send("ok");

    const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);

    // Map Mollie to app payment status
    let newStatus = "payment_open";
    if (mollieStatus === "paid") newStatus = "paid";
    else if (mollieStatus === "authorized") newStatus = "paid"; // optional
    else if (mollieStatus === "failed") newStatus = "failed";
    else if (mollieStatus === "expired") newStatus = "expired";
    else if (mollieStatus === "canceled") newStatus = "canceled";
    else if (mollieStatus === "pending") newStatus = "pending";

    await txRef.set(
      {
        status: newStatus,
        paymentStatus: newStatus,
        molliePaymentId: payment.id,
        mollieStatus,
        molliePaidAt: newStatus === "paid" ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("✅ Firestore updated:", { path: txRef.path, newStatus, mollieStatus });

    return res.status(200).send("ok");
  } catch (err) {
    console.log("❌ Mollie webhook error:", err?.message || String(err));
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
   pawaPay
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

  const headers = {
    Authorization: `Bearer ${PAWAPAY_TOKEN}`,
    Accept: "application/json",
  };
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

/**
 * Optional debug endpoints
 */
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

app.get("/pawapay/active-conf", async (req, res) => {
  if (!requirePawaPayToken(res)) return;
  const result = await pawaPayFetch("/v2/active-configuration", { method: "GET" });
  safeJson(res, result.ok ? 200 : result.status, result);
});

app.post("/pawapay/paymentpage/deposit", async (req, res) => {
  if (!requirePawaPayToken(res)) return;

  const { amount, currency = "ZMW", customerMessage = "FutaPay test", phoneNumber, returnUrl } = req.body || {};

  if (!amount || !phoneNumber) {
    return safeJson(res, 400, { ok: false, error: "Missing required fields: amount, phoneNumber" });
  }

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

// Payout request
app.post("/pawapay/payouts", async (req, res) => {
  if (!requirePawaPayToken(res)) return;

  const {
    uid,
    txId,
    provider, // can be label ("MTN MoMo") OR code ("MTN_MOMO_ZMB")
    phoneNumber,
    amount,
    currency = "ZMW",
    customerMessage = "FutaPay payout test",
    countryIso3 = "ZMB", // pass this from app if possible
  } = req.body || {};

  if (!uid || !txId) return safeJson(res, 400, { ok: false, error: "Missing required fields: uid, txId" });
  if (!provider || !phoneNumber || !amount) {
    return safeJson(res, 400, { ok: false, error: "Missing required fields: provider, phoneNumber, amount" });
  }

  const iso3 = String(countryIso3 || "").toUpperCase().trim() || "ZMB";

  // ✅ Normalize + validate MSISDN
  const norm = normalizeMsisdnForCountry(phoneNumber, iso3);
  if (!norm.ok) {
    // store failure for debugging
    const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);
    await txRef.set(
      {
        status: "payout_failed",
        payoutStatus: "REQUEST_FAILED",
        pawaPay: {
          status: "REQUEST_FAILED",
          lastHttpStatus: 400,
          lastResponse: {
            failureReason: { failureCode: "INVALID_RECIPIENT_FORMAT", failureMessage: norm.error },
          },
          phoneNumberUsed: norm.msisdn,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return safeJson(res, 400, { ok: false, error: norm.error, msisdn: norm.msisdn });
  }

  // ✅ Resolve provider to pawaPay code
  const prov = resolvePawaPayProvider({ provider, iso3 });
  if (!prov.ok) return safeJson(res, 400, { ok: false, error: prov.error });

  const payoutId = crypto.randomUUID();

  const payload = {
    payoutId,
    amount: String(amount),
    currency,
    recipient: {
      type: "MMO",
      accountDetails: {
        provider: prov.providerCode,
        phoneNumber: String(norm.msisdn), // digits only
      },
    },
    customerMessage,
  };

  const result = await pawaPayFetch("/v2/payouts", { method: "POST", body: payload });

  // Store request + response in Firestore (track it later)
  const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);

  await txRef.set(
    {
      pawaPay: {
        payoutId,
        request: payload,
        lastResponse: result.data,
        lastHttpStatus: result.status,
        status: result.ok ? (result.data?.status || "ACCEPTED") : "REQUEST_FAILED",
        providerUsed: prov.providerCode,
        phoneNumberUsed: norm.msisdn,
      },
      // Keep a clean app-level payout status too
      payoutStatus: result.ok ? "REQUEST_ACCEPTED" : "REQUEST_FAILED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (!result.ok) {
    return safeJson(res, result.status, {
      ok: false,
      error: "pawaPay payout creation failed",
      details: result.data,
      payoutId,
      providerUsed: prov.providerCode,
      phoneNumberUsed: norm.msisdn,
    });
  }

  return safeJson(res, 200, {
    ok: true,
    payoutId,
    providerUsed: prov.providerCode,
    phoneNumberUsed: norm.msisdn,
    raw: result.data,
  });
});

/* --------------------------
   pawaPay callbacks
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

    // Always ACK quickly
    if (!payoutId || !status) return res.status(200).send("ok");

    const internal = mapPawaPayStatusToInternal(status);

    // Find matching transaction across users
    const snap = await firestore()
      .collectionGroup("transactions")
      .where("pawaPay.payoutId", "==", String(payoutId))
      .limit(5)
      .get();

    if (snap.empty) {
      console.log("⚠️ No transaction found for payoutId:", payoutId);
      return res.status(200).send("ok");
    }

    const batch = firestore().batch();
    for (const doc of snap.docs) {
      batch.set(
        doc.ref,
        {
          status: internal,
          payoutStatus: internal,
          pawaPay: {
            ...(doc.data()?.pawaPay || {}),
            status: String(status),
            lastCallback: event,
            callbackReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return res.status(200).send("ok");
  } catch (err) {
    console.log("❌ pawaPay webhook error:", err?.message || String(err));
    return res.status(200).send("ok");
  }
});

/* --------------------------
   Start server
-------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Public base URL: ${PUBLIC_BASE_URL}`);
});
