import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firebaseSignUp } from "./FirebaseAuth.js";

const SignupScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);
    try {
      const userCredential = await firebaseSignUp(email, password);

     await AsyncStorage.removeItem("userToken");
     await AsyncStorage.removeItem("user");
    navigation.replace("Login");

      navigation.replace("Home");


      Alert.alert("Signup successful!", `Welcome, ${email}`);
      navigation.replace("Home");
    } catch (error) {
      Alert.alert("Signup failed", error?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Sign up to get started with FutaPay</Text>

      <TextInput
        placeholder="Full Name"
        placeholderTextColor="#9ca3af"
        value={name}
        onChangeText={setName}
        style={styles.input}
      />

      <TextInput
        placeholder="Email Address"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="Password"
        placeholderTextColor="#9ca3af"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      <TouchableOpacity
        onPress={handleSignup}
        style={[styles.button, loading && { opacity: 0.7 }]}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.replace("Login")}>
        <Text style={styles.loginLink}>
          Already have an account?{" "}
          <Text style={{ color: "#2563eb", fontWeight: "bold" }}>Sign In</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    fontSize: 16,
    backgroundColor: "#f3f4f6",
    color: "#111827",
  },
  button: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
  loginLink: {
    color: "#111827",
    fontSize: 16,
    textAlign: "center",
  },
});

export default SignupScreen;
