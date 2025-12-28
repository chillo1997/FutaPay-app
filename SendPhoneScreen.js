import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from "react-native";

export default function SendPhoneScreen({ navigation, route }) {
  const { country, transferType, providerId, providerLabel } = route.params || {};


  const [phone, setPhone] = useState(prefillPhone);
  const [amount, setAmount] = useState("");

  const handlePickRecipient = () => {
    navigation.navigate("Recipients", {
      mode: "pick",
      pickParams: { country, transferType, provider },
    });
  };

  const handleReview = () => {
    navigation.navigate("SendReview", {
      country,
      transferType,
      provider,
      phone,
      amount,
      recipientName: prefillName,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receiver Info</Text>

      <TouchableOpacity style={styles.secondaryBtn} onPress={handlePickRecipient}>
        <Text style={styles.secondaryBtnText}>Choose saved recipient</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Phone</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. +201234567890"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Amount (€)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 10"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={handleReview}>
        <Text style={styles.primaryBtnText}>Review</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 14, color: "#111827" },
  label: { color: "#6b7280", fontWeight: "800", marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#111827",
  },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryBtnText: { color: "#111827", fontWeight: "900" },
  primaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 14,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
