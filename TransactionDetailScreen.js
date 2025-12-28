import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

const TX_KEY = "transactions";

function maskPhone(phone) {
  if (!phone) return "—";
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

async function loadAll() {
  const raw = await AsyncStorage.getItem(TX_KEY);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

async function saveAll(list) {
  await AsyncStorage.setItem(TX_KEY, JSON.stringify(list));
}

export default function TransactionDetailScreen({ navigation, route }) {
  const id = route?.params?.id;
  const [tx, setTx] = useState(null);

  const refresh = useCallback(() => {
    (async () => {
      const list = await loadAll();
      const found = list.find((t) => t.id === id);
      setTx(found || null);
    })();
  }, [id]);

  useFocusEffect(refresh);

  const updateStatus = async (newStatus) => {
    try {
      const list = await loadAll();
      const updated = list.map((t) =>
        t.id === id ? { ...t, status: newStatus, updatedAt: Date.now() } : t
      );
      await saveAll(updated);
      setTx(updated.find((t) => t.id === id) || null);
    } catch (e) {
      Alert.alert("Error", e?.message ?? "Could not update status.");
    }
  };

  const deleteTx = async () => {
    Alert.alert("Delete transfer?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const list = await loadAll();
          const updated = list.filter((t) => t.id !== id);
          await saveAll(updated);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!tx) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Transfer</Text>
        <Text style={styles.empty}>Transfer not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Transfer details</Text>

      <View style={styles.card}>
        <Row label="Type" value={tx.type === "send" ? "Send" : "Receive"} />
        <Row label="Amount" value={`€${tx.amount}`} />
        <Row label="Recipient" value={tx.recipientName || "—"} />
        <Row label="Phone" value={maskPhone(tx.phone)} />
        <Row label="Country" value={tx.country || "—"} />
        <Row label="Provider" value={tx.provider || "—"} />
        <Row label="Transfer type" value={tx.transferType || "—"} />
        <Row label="Status" value={tx.status || "pending"} />
      </View>

      <Text style={styles.sectionTitle}>Demo controls</Text>
      <Text style={styles.note}>
        For now, you can simulate the payment lifecycle. Later, your webhook will do this.
      </Text>

      <Button text="Mark as paid" onPress={() => updateStatus("paid")} />
      <Button text="Mark payout initiated" onPress={() => updateStatus("payout_initiated")} />
      <Button text="Mark completed" onPress={() => updateStatus("completed")} />
      <Button danger text="Mark failed" onPress={() => updateStatus("failed")} />

      <TouchableOpacity style={styles.deleteBtn} onPress={deleteTx}>
        <Text style={styles.deleteBtnText}>Delete transfer</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

function Button({ text, onPress, danger = false }) {
  return (
    <TouchableOpacity
      style={[styles.btn, danger && { backgroundColor: "#ef4444" }]}
      onPress={onPress}
    >
      <Text style={styles.btnText}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#fff", padding: 20 },
  title: { fontSize: 22, fontWeight: "900", color: "#111827", marginBottom: 12 },
  empty: { color: "#6b7280", fontWeight: "700" },

  card: {
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { color: "#6b7280", fontWeight: "800" },
  rowValue: { color: "#111827", fontWeight: "900", maxWidth: "60%", textAlign: "right" },

  sectionTitle: { marginTop: 6, fontSize: 16, fontWeight: "900", color: "#111827" },
  note: { marginTop: 6, marginBottom: 12, color: "#6b7280", fontWeight: "700", lineHeight: 18 },

  btn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  deleteBtn: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  deleteBtnText: { color: "#ef4444", fontWeight: "900" },
});
