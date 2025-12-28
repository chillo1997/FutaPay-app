import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

function maskUid(uid) {
  if (!uid || uid.length < 10) return uid ?? "—";
  return `${uid.slice(0, 4)}…${uid.slice(-4)}`;
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value ?? "—"}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const raw = await AsyncStorage.getItem("user");
        if (raw) setUser(JSON.parse(raw));
      } catch (err) {
        Alert.alert("Error", "Unable to load profile data.");
      }
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem("user");
      await AsyncStorage.removeItem("userToken");
      navigation.replace("Login");
    } catch (error) {
      Alert.alert("Sign out failed", error?.message ?? "Unknown error");
    }
  };

  if (!user) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // Support both shapes: stored user OR stored userCredential
  const u = user?.user ?? user;
  const email = u?.email ?? "—";
  const name = u?.displayName ?? user?.name ?? "—";
  const uidShort = maskUid(u?.uid);

  // Firebase user metadata (may exist depending on what you stored)
  const createdAt = u?.metadata?.creationTime ?? "—";
  const lastSignIn = u?.metadata?.lastSignInTime ?? "—";

  // Placeholders (later: from backend rules)
  const kycStatus = "Not started";
  const twoFA = "Off";
  const dailyLimit = "€250";
  const remainingToday = "€250";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Row label="Full name" value={name} />
        <Row label="Email" value={email} />
        <Row label="User ID" value={uidShort} />
        <Row label="Created" value={createdAt} />
        <Row label="Last sign-in" value={lastSignIn} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security</Text>
        <Row label="KYC status" value={kycStatus} />
        <Row label="2FA" value={twoFA} />
        <Text style={styles.small}>
          Tip: Never send money to someone you don’t know. Double-check the recipient details before paying.
        </Text>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => Alert.alert("Coming soon", "Add FaceID/PIN lock here later.")}
        >
          <Text style={styles.secondaryBtnText}>Set app lock (FaceID/PIN)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Limits</Text>
        <Row label="Daily sending limit" value={dailyLimit} />
        <Row label="Remaining today" value={remainingToday} />
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => Alert.alert("Coming soon", "Limit settings will be managed by compliance rules.")}
        >
          <Text style={styles.secondaryBtnText}>View limit rules</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.dangerBtn} onPress={handleSignOut}>
        <Text style={styles.dangerBtnText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 14, textAlign: "center" },

  card: {
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 10 },

  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { color: "#6b7280", fontSize: 14, fontWeight: "600" },
  rowValue: { color: "#111827", fontSize: 14, fontWeight: "700", maxWidth: "60%", textAlign: "right" },

  small: { marginTop: 10, color: "#6b7280", fontSize: 13, lineHeight: 18 },

  secondaryBtn: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#111827", fontWeight: "800" },

  dangerBtn: {
    marginTop: 8,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 26,
  },
  dangerBtnText: { color: "#fff", fontWeight: "900" },
});
