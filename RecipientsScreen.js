import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  FlatList,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";

const STORAGE_KEY = "recipients";

function maskPhone(phone) {
  if (!phone) return "-";
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

async function loadRecipients() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

async function saveRecipients(list) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function RecipientsScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const mode = route?.params?.mode ?? "manage"; // "manage" or "pick"
  const pickParams = route?.params?.pickParams ?? null;

  const [recipients, setRecipients] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const refresh = useCallback(() => {
    (async () => {
      const list = await loadRecipients();
      setRecipients(list);
    })();
  }, []);

  // Refresh whenever screen is opened
  useFocusEffect(refresh);

  const addRecipient = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert("Missing info", "Please enter name and phone.");
      return;
    }

    const newItem = {
      id: String(Date.now()),
      name: name.trim(),
      phone: phone.trim(),
    };

    const updated = [newItem, ...recipients];
    setRecipients(updated);
    await saveRecipients(updated);

    setName("");
    setPhone("");
  };

  const deleteRecipient = async (id) => {
    const updated = recipients.filter((r) => r.id !== id);
    setRecipients(updated);
    await saveRecipients(updated);
  };

  const pickRecipient = (r) => {
    // Go back to SendPhone and prefill
    navigation.navigate("SendPhone", {
      ...(pickParams || {}),
      prefillPhone: r.phone,
      prefillName: r.name,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {mode === "pick" ? "Choose recipient" : "Recipients"}
      </Text>

      {mode !== "pick" && (
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (e.g. +201234...)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={addRecipient}>
            <Text style={styles.primaryBtnText}>Add recipient</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={recipients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowPhone}>{maskPhone(item.phone)}</Text>
            </View>

            {mode === "pick" ? (
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => pickRecipient(item)}
              >
                <Text style={styles.smallBtnText}>Use</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: "#ef4444" }]}
                onPress={() => deleteRecipient(item.id)}
              >
                <Text style={styles.smallBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {recipients.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No recipients yet</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#f9f9fb",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    color: "#111827",
  },
  card: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
    color: "#111827",
  },
  primaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowName: {
    fontWeight: "600",
    color: "#111827",
  },
  rowPhone: {
    color: "#6b7280",
    marginTop: 4,
  },
  smallBtn: {
    backgroundColor: "#10b981",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  smallBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  empty: {
    marginTop: 20,
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
  },
});
