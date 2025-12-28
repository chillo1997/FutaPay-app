import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

const TX_KEY = "transactions";

function maskPhone(phone) {
  if (!phone) return "—";
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

async function loadTransactions() {
  const raw = await AsyncStorage.getItem(TX_KEY);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

export default function TransactionsScreen({ navigation }) {
  const [tx, setTx] = useState([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const list = await loadTransactions();
        // newest first
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setTx(list);
      })();
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>All transfers</Text>

      <FlatList
        data={tx}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No transfers yet</Text>
            <Text style={styles.emptyText}>Create a send or receive to see it here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate("TransactionDetail", { id: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {item.type === "send" ? "Sent" : "Received"} • €{item.amount}
              </Text>
              <Text style={styles.rowMeta}>
                {item.country} • {item.provider} • {maskPhone(item.phone)}
              </Text>
            </View>

            <View style={styles.pill}>
              <Text style={styles.pillText}>{item.status ?? "pending"}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  title: { fontSize: 22, fontWeight: "900", color: "#111827", marginBottom: 12 },

  row: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowTitle: { color: "#111827", fontWeight: "900" },
  rowMeta: { marginTop: 4, color: "#6b7280", fontWeight: "700" },

  pill: {
    backgroundColor: "#111827",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pillText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  emptyBox: {
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  emptyTitle: { fontWeight: "900", color: "#111827", marginBottom: 6 },
  emptyText: { color: "#6b7280", fontWeight: "700" },
});
