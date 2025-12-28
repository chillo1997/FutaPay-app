import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Picker } from "@react-native-picker/picker";

export default function SendTransferTypeScreen({ navigation, route }) {
  const country = route?.params?.country ?? "";
  const [transferType, setTransferType] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Transfer type</Text>

      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={transferType}
          onValueChange={(val) => setTransferType(val)}
          style={styles.picker}
        >
          <Picker.Item label="-- Choose Type --" value="" />
          <Picker.Item label="Mobile Wallet" value="Mobile Wallet" />
          <Picker.Item label="Bank Transfer" value="Bank Transfer" />
        </Picker>
      </View>

      {/* Next button (simple) */}
      <Text
        style={[styles.next, !transferType && { opacity: 0.5 }]}
        onPress={() => {
          if (!transferType) return;
          navigation.navigate("SendProvider", { country, transferType });
        }}
      >
        Next →
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#fff", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 12, color: "#111827", textAlign: "center" },

  // ✅ IMPORTANT FOR iOS: give the picker wrapper a height
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
    height: 180,
    justifyContent: "center",
  },
  picker: { height: 180 },

  next: {
    marginTop: 16,
    textAlign: "center",
    fontWeight: "900",
    color: "#2563eb",
    fontSize: 18,
  },
});
