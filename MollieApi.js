// mollieApi.js

const MOLLIE_API_KEY = "test_BSWvPTBwcHpaV4AMAQUugFAurE3KVp"; 

export async function createMolliePayment({ amount, description, redirectUrl }) {
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MOLLIE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: {
        currency: "EUR",
        value: amount, // e.g., "10.00"
      },
      description,
      redirectUrl,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Payment creation failed");
  }
  return data;
}

export async function getMolliePaymentStatus(paymentId) {
  const response = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${MOLLIE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Failed to fetch payment status");
  }
  return data;
}

