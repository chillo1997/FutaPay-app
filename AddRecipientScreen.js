import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "recipients";

async function loadRecipients() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveRecipients(list) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function AddRecipientScreen({ navigation }) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Egypt");
  const [provider, setProvider] = useState("Vodafone Cash");
  const [phone, setPhone] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !phone.trim() || !provider.trim() || !country.trim()) {
      Alert.alert("Missing info", "Please fill in name, country, provider, and phone.");
      return;
    }

    const newRecipient = {
      id: String(Date.now()),
      name: name.trim(),
      country: country.trim(),
      provider: provider.trim(),
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
    };

    const current = await loadRecipients();
    const updated = [newRecipient, ...(Array.isArray(current) ? current : [])];

    await saveRecipients(updated);
    navigation.goBack();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Add Recipient</Text>

      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} placeholder="e.g. Ahmed Ali" value={name} onChangeText={setName} />

      <Text style={styles.label}>Country</Text>
      <TextInput style={styles.input} placeholder="e.g. Egypt" value={country} onChangeText={setCountry} />

      <Text style={styles.label}>Provider</Text>
      <TextInput style={styles.input} placeholder="e.g. Vodafone Cash" value={provider} onChangeText={setProvider} />

      <Text style={styles.label}>Phone</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. +201234567890"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
        <Text style={styles.primaryBtnText}>Save Recipient</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 16, textAlign: "center" },

  label: { color: "#6b7280", fontWeight: "800", marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  backBtn: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  backBtnText: { color: "#2563eb", fontWeight: "900", fontSize: 16 },
});
