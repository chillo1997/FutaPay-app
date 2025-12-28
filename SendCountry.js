import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { createMolliePayment } from "./MollieApi.js";

export default function SendCountryScreen() {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendMoney = async () => {
    // Basic validation
    const n = Number(String(amount).replace(",", "."));
    if (!n || n <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount (e.g. 10.00).");
      return;
    }

    setLoading(true);
    try {
      const description = "Test transaction";
      const redirectUrl = "https://www.futapay.app";

      // Mollie usually expects a 2-decimal string
      const payment = await createMolliePayment({
        amount: n.toFixed(2),
        description,
        redirectUrl,
      });

      const checkoutUrl = payment?._links?.checkout?.href;

      if (checkoutUrl) {
        await WebBrowser.openBrowserAsync(checkoutUrl);
        // Optional: after payment page closes, you could navigate somewhere
        // navigation.navigate("SendConfirmation");
      } else {
        Alert.alert("Error", "Could not get payment link.");
      }
    } catch (error) {
      Alert.alert("Payment Failed", error?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send Money</Text>

      <TextInput
        style={styles.input}
        placeholder="Amount (e.g. 10.00)"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <TouchableOpacity
        style={[styles.button, (loading || !amount) && { opacity: 0.7 }]}
        onPress={handleSendMoney}
        disabled={loading || !amount}
      >
        {loading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>Processing...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>Send</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 16,
    width: "80%",
  },
  button: { backgroundColor: "#2563eb", padding: 12, borderRadius: 8, alignItems: "center", width: "80%" },
  buttonText: { color: "#fff", fontWeight: "bold" },
});
