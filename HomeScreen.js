import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

const TX_KEY = "transactions";

// Small helper: mask phone for security
function maskPhone(phone) {
  if (!phone) return "—";
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

// Read from storage
async function loadTransactions() {
  const raw = await AsyncStorage.getItem(TX_KEY);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

// Reusable button
const PrimaryButton = ({ text, onPress }) => (
  <TouchableOpacity style={styles.primaryBtn} onPress={onPress}>
    <Text style={styles.primaryBtnText}>{text}</Text>
  </TouchableOpacity>
);

const SecondaryButton = ({ text, onPress }) => (
  <TouchableOpacity style={styles.secondaryBtn} onPress={onPress}>
    <Text style={styles.secondaryBtnText}>{text}</Text>
  </TouchableOpacity>
);

export default function HomeScreen({ navigation }) {
  const [transactions, setTransactions] = useState([]);

  // Refresh every time Home becomes active
  useFocusEffect(
    useCallback(() => {
      const run = async () => {
        const tx = await loadTransactions();
        // newest first
        setTransactions(tx.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      };
      run();
    }, [])
  );

  return (
    <ScrollView contentContainerStyle={styles.containerCentered}>
      {/* Top header with clear Profile button */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>FutaPay</Text>
          <Text style={styles.subtitle}>Fast links. Simple transfers.</Text>
        </View>

        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.profileBtnText}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Main actions */}
      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Quick actions</Text>

        <PrimaryButton text="Send money" onPress={() => navigation.navigate("SendCountry")} />
        <PrimaryButton text="Receive money" onPress={() => navigation.navigate("ReceiveAmount")} />
        <SecondaryButton text="Recipients" onPress={() => navigation.navigate("Recipients")} />
        <SecondaryButton text="Transactions" onPress={() => navigation.navigate("Transactions")} />

      </View>

      {/* Recent transfers (dynamic) */}
      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Recent transfers</Text>

        {transactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No transfers yet</Text>
            <Text style={styles.emptyText}>
              Make a transfer and it will appear here automatically.
            </Text>
          </View>
        ) : (
          transactions.slice(0, 6).map((t) => (
            <View key={t.id} style={styles.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txTitle}>
                  {t.type === "send" ? "Sent" : "Received"} • €{t.amount}
                </Text>
                <Text style={styles.txMeta}>
                  {t.country} • {t.provider} • {maskPhone(t.phone)}
                </Text>
              </View>

              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{t.status ?? "pending"}</Text>
              </View>
            </View>
          ))
        )}


        {transactions.length > 0 && (
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate("Transactions")}
          >
            <Text style={styles.linkBtnText}>View all</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff" },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  brand: { fontSize: 26, fontWeight: "900", color: "#111827" },
  subtitle: { marginTop: 2, color: "#6b7280", fontWeight: "700" },

  profileBtn: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  profileBtnText: { color: "#fff", fontWeight: "900" },

  actionsCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 12 },

  primaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  secondaryBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#111827", fontWeight: "900", fontSize: 16 },

  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  emptyTitle: { fontWeight: "900", color: "#111827", marginBottom: 6 },
  emptyText: { color: "#6b7280", fontWeight: "700", lineHeight: 18 },

  txRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  txTitle: { color: "#111827", fontWeight: "900" },
  txMeta: { marginTop: 4, color: "#6b7280", fontWeight: "700" },

  statusPill: {
    backgroundColor: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  statusText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  linkBtn: { marginTop: 6, alignItems: "center", paddingVertical: 10 },
  linkBtnText: { color: "#2563eb", fontWeight: "900" },

  containerCentered: {
  flexGrow: 1,
  padding: 20,
  backgroundColor: "#fff",
  justifyContent: "center", // ✅ centers vertically
},



});
