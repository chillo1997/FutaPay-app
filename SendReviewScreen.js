import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TX_KEY = "transactions";

function maskPhone(phone) {
  if (!phone) return "—";
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

async function addTransaction(tx) {
  const raw = await AsyncStorage.getItem(TX_KEY);
  const list = raw ? JSON.parse(raw) : [];
  const safeList = Array.isArray(list) ? list : [];
  const updated = [tx, ...safeList];
  await AsyncStorage.setItem(TX_KEY, JSON.stringify(updated));
}

export default function SendReviewScreen({ navigation, route }) {
  const {
    country = "—",
    transferType = "—",
    provider = "—",
    phone = "",
    amount = "",
    recipientName = "",
  } = route.params || {};

  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!phone || !amount) {
      Alert.alert("Missing info", "Phone and amount are required.");
      return;
    }

    setSaving(true);
    try {
      await addTransaction({
        id: String(Date.now()),
        type: "send",
        amount: String(amount),
        phone: String(phone),
        country: String(country),
        provider: String(provider),
        transferType: String(transferType),
        recipientName: String(recipientName || ""),
        status: "success", 
        createdAt: Date.now(),
      });

      navigation.navigate("SendConfirmation");
    } catch (e) {
      Alert.alert("Error", e?.message ?? "Could not save transfer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Review transfer</Text>

      <View style={styles.card}>
        <Row label="Recipient" value={recipientName || "—"} />
        <Row label="Phone" value={maskPhone(phone)} />
        <Row label="Country" value={country} />
        <Row label="Type" value={transferType} />
        <Row label="Provider" value={provider} />
        <Row label="Amount" value={`€${amount}`} />
      </View>

      <Text style={styles.tip}>
        Tip: Double-check the recipient details before confirming.
      </Text>

      <TouchableOpacity
        style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
        onPress={handleConfirm}
        disabled={saving}
      >
        <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Confirm & Continue"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 14, textAlign: "center" },

  card: { backgroundColor: "#f3f4f6", borderRadius: 16, padding: 16, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { color: "#6b7280", fontWeight: "800" },
  rowValue: { color: "#111827", fontWeight: "900", maxWidth: "60%", textAlign: "right" },

  tip: { color: "#6b7280", fontWeight: "700", marginBottom: 14, textAlign: "center" },

  primaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  backBtn: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  backBtnText: { color: "#2563eb", fontWeight: "900", fontSize: 16 },
});

