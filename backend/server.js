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
app.use(express.urlencoded({ extended: false })); // Mollie webhooks often urlencoded
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

    const paymentId = req.body?.id || req.query?.id;

    console.log("✅ Mollie webhook hit:", {
      paymentId,
      contentType: req.headers["content-type"],
      body: req.body,
      ts: new Date().toISOString(),
    });

    if (!paymentId) return res.status(200).send("ok");

    const payment = await mollie.payments.get(String(paymentId));
    const status = payment.status;

    const uid = payment?.metadata?.uid;
    const txId = payment?.metadata?.txId || payment?.metadata?.txid;
    if (!uid || !txId) return res.status(200).send("ok");

    console.log("✅ Mollie payment fetched:", { paymentId: payment.id, status, uid, txId });

    const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);

    let newStatus = "payment_open";
    if (status === "paid") newStatus = "paid";
    else if (status === "authorized") newStatus = "paid"; // optional
    else if (status === "failed") newStatus = "failed";
    else if (status === "expired") newStatus = "expired";
    else if (status === "canceled") newStatus = "canceled";
    else if (status === "pending") newStatus = "pending";

    // ✅ Keep status as payment pipeline status
    await txRef.set(
      {
        status: newStatus,
        paymentStatus: newStatus,
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

function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

function sanitizeMsisdn(phone) {
  // pawaPay accepts digits (no '+'), predict-provider also returns digits
  const s = String(phone || "").trim();
  if (!s) return "";
  return s.replace(/[^\d]/g, "");
}

function looksLikeProviderCode(provider) {
  // e.g. MTN_MOMO_ZMB
  const s = String(provider || "").trim();
  return /^[A-Z0-9_]+$/.test(s) && /_[A-Z]{3}$/.test(s);
}

async function predictProvider(phoneNumber) {
  // pawaPay Predict Provider endpoint (POST /v2/predict-provider) :contentReference[oaicite:2]{index=2}
  const result = await pawaPayFetch("/v2/predict-provider", {
    method: "POST",
    body: { phoneNumber: String(phoneNumber) },
  });

  if (!result.ok) return { ok: false, result };

  return {
    ok: true,
    countryIso3: result.data?.country,
    providerCode: result.data?.provider,
    msisdnDigits: result.data?.phoneNumber, // digits string
    raw: result.data,
  };
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

// Payment page deposit (optional)
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
    provider, // can be LABEL ("MTN MoMo") OR CODE ("MTN_MOMO_ZMB")
    phoneNumber,
    amount,
    currency = "ZMW",
    customerMessage = "FutaPay payout test",
  } = req.body || {};

  if (!uid || !txId) return safeJson(res, 400, { ok: false, error: "Missing required fields: uid, txId" });
  if (!phoneNumber || !amount) {
    return safeJson(res, 400, { ok: false, error: "Missing required fields: phoneNumber, amount" });
  }

  const payoutId = crypto.randomUUID();

  // ✅ Resolve provider code + sanitized msisdn
  let providerCode = String(provider || "").trim();
  let msisdnDigits = sanitizeMsisdn(phoneNumber);

  if (!looksLikeProviderCode(providerCode)) {
    const pred = await predictProvider(phoneNumber);
    if (pred.ok) {
      providerCode = pred.providerCode; // e.g. MTN_MOMO_ZMB :contentReference[oaicite:3]{index=3}
      msisdnDigits = pred.msisdnDigits || msisdnDigits;
      console.log("✅ pawaPay predict-provider used:", {
        input: phoneNumber,
        providerCode,
        msisdnDigits,
        countryIso3: pred.countryIso3,
      });
    } else {
      console.log("⚠️ predict-provider failed, will try provided provider as-is:", pred?.result?.data);
    }
  }

  if (!providerCode) {
    return safeJson(res, 400, { ok: false, error: "Missing/invalid provider. Provide provider code or a valid phoneNumber." });
  }

  const payload = {
    payoutId,
    amount: String(amount),
    currency,
    recipient: {
      type: "MMO",
      accountDetails: {
        provider: providerCode,
        phoneNumber: String(msisdnDigits), // digits no '+'
      },
    },
    customerMessage,
  };

  // Initiate payout :contentReference[oaicite:4]{index=4}
  const result = await pawaPayFetch("/v2/payouts", { method: "POST", body: payload });

  const txRef = firestore().doc(`users/${uid}/transactions/${txId}`);

  // ✅ Store payout info WITHOUT overwriting payment status
  await txRef.set(
    {
      payoutStatus: result.ok ? "REQUEST_ACCEPTED" : "REQUEST_FAILED",
      pawaPay: {
        payoutId,
        providerUsed: providerCode,
        phoneNumberUsed: String(msisdnDigits),
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
    return safeJson(res, result.status, {
      ok: false,
      error: "pawaPay payout creation failed",
      details: result.data,
      payoutId,
      providerUsed: providerCode,
    });
  }

  return safeJson(res, 200, {
    ok: true,
    payoutId,
    providerUsed: providerCode,
    phoneNumberUsed: String(msisdnDigits),
    raw: result.data,
  });
});

/* --------------------------
   pawaPay callbacks
-------------------------- */
function mapPawaPayStatusToInternal(status) {
  const s = String(status || "").toUpperCase();

  if (["ACCEPTED", "ENQUEUED", "PENDING", "PROCESSING"].includes(s)) return "PROCESSING";
  if (["COMPLETED", "SUCCESSFUL", "SUCCESS"].includes(s)) return "COMPLETED";
  if (["FAILED", "REJECTED", "CANCELLED", "CANCELED", "EXPIRED"].includes(s)) return "FAILED";

  return "UNKNOWN";
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

    const payoutState = mapPawaPayStatusToInternal(status);

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
          // ✅ DON'T overwrite payment status field here
          payoutStatus: payoutState, // COMPLETED / FAILED / PROCESSING / UNKNOWN
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
   Start
-------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Public base URL: ${PUBLIC_BASE_URL}`);
});
