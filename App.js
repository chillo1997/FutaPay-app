import "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView, 
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { Picker } from "@react-native-picker/picker";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";

/**
 * If you want to use your real screens later, set this to true
 * AND uncomment the real imports below (and remove placeholder consts).
 */
const USE_REAL_SCREENS = true;
const Stack = createNativeStackNavigator(); // <-- MUST exist before you use <Stack.Screen />

 //Real imports (enable later when stable)
import LoginScreenReal from "./Loginscreen.js";
import SignupScreenReal from "./Signupscreen.js";
import HomeScreenReal from "./HomeScreen.js";
import ProfileScreenReal from "./Profilescreen.js";
import RecipientsScreen from "./RecipientsScreen.js";
import AddRecipientScreen from "./AddRecipientScreen.js";
import SendPhoneScreen from "./SendPhoneScreen.js";
import TransactionsScreen from "./TransactionsScreen.js";
import TransactionDetailScreen from "./TransactionDetailScreen.js";




import { createMolliePayment as createMolliePaymentReal } from "./MollieApi.js";
import SendTransferTypeScreen from "./SendTransferTypeScreen.js";


// ----- PROVIDER MAP -----
const providerMap = {
  Egypt: {
    "Mobile Wallet": ["Vodafone Cash", "Orange Money"],
    "Bank Transfer": ["Commercial Bank", "UBA"],
  },
  Congo: {
    "Mobile Wallet": ["Airtel", "M-Pesa"],
    "Bank Transfer": ["Commercial Bank", "UBA"],
  },
};

// ----- REUSABLE COMPONENTS -----
const Header = ({ title, navigation, showBack = true }) => (
  <View style={{ marginBottom: 20 }}>
    {showBack && (
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={{ fontSize: 18, color: "#2563eb" }}>← Back</Text>
      </TouchableOpacity>
    )}
    <Text style={styles.title}>{title}</Text>
  </View>
);

const PrimaryButton = ({ text, onPress, disabled }) => (
  <TouchableOpacity
    style={[styles.buttonPrimary, disabled && { opacity: 0.6 }]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={styles.buttonPrimaryText}>{text}</Text>
  </TouchableOpacity>
);

// ----- PLACEHOLDER SCREENS (safe boot) -----
const LoginScreenPlaceholder = ({ navigation }) => (
  <View style={styles.center}>
    <Text style={{ fontSize: 20, marginBottom: 12 }}>Login OK</Text>
    <PrimaryButton text="Go to Signup" onPress={() => navigation.navigate("Signup")} />
    <PrimaryButton text="Go to Home" onPress={() => navigation.navigate("Home")} />
  </View>
);

const SignupScreenPlaceholder = ({ navigation }) => (
  <View style={styles.center}>
    <Text style={{ fontSize: 20, marginBottom: 12 }}>Signup OK</Text>
    <PrimaryButton text="Back to Login" onPress={() => navigation.navigate("Login")} />
  </View>
);

const HomeScreenPlaceholder = ({ navigation }) => (
  <ScrollView contentContainerStyle={styles.container}>
    <Header title="Home" navigation={navigation} showBack={false} />
    <PrimaryButton text="Send Money" onPress={() => navigation.navigate("SendCountry")} />
    <PrimaryButton text="Receive Money" onPress={() => navigation.navigate("ReceiveAmount")} />
    <PrimaryButton text="Profile" onPress={() => navigation.navigate("Profile")} />
  </ScrollView>
);

const ProfileScreenPlaceholder = ({ navigation }) => (
  <View style={styles.center}>
    <Text style={{ fontSize: 20, marginBottom: 12 }}>Profile OK</Text>
    <PrimaryButton text="Back to Home" onPress={() => navigation.navigate("Home")} />
  </View>
);

// Pick which components to use
const LoginScreen = USE_REAL_SCREENS ? LoginScreenReal : LoginScreenPlaceholder;
const SignupScreen = USE_REAL_SCREENS ? SignupScreenReal : SignupScreenPlaceholder;
const HomeScreen = USE_REAL_SCREENS ? HomeScreenReal : HomeScreenPlaceholder;
const ProfileScreen = USE_REAL_SCREENS ? ProfileScreenReal : ProfileScreenPlaceholder;

// Mollie (safe stub for now)
const createMolliePayment = async () => {
  throw new Error("Mollie disabled (placeholder mode). Enable real import later.");
  // return createMolliePaymentReal(...args);
};

// ----- SEND FLOW -----
function SendCountry({ navigation }) {
  const [country, setCountry] = React.useState("");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Select Country" navigation={navigation} />
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={country} onValueChange={setCountry}>
          <Picker.Item label="-- Choose Country --" value="" />
          <Picker.Item label="🇪🇬 Egypt" value="Egypt" />
          <Picker.Item label="🇨🇩 Congo" value="Congo" />
        </Picker>
      </View>
      <PrimaryButton
        text="Next"
        disabled={!country}
        onPress={() => navigation.navigate("SendTransferType", { country })}
      />
    </ScrollView>
  );
}

function SendTransferType({ navigation, route }) {
  const { country } = route.params;
  const [transferType, setTransferType] = React.useState("");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Transfer Type" navigation={navigation} />
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={transferType} onValueChange={setTransferType}>
          <Picker.Item label="-- Choose Type --" value="" />
          <Picker.Item label="Bank Transfer" value="Bank Transfer" />
          <Picker.Item label="Mobile Wallet" value="Mobile Wallet" />
        </Picker>
      </View>
      <PrimaryButton
        text="Next"
        disabled={!transferType}
        onPress={() => navigation.navigate("SendProvider", { country, transferType })}
      />
    </ScrollView>
  );
}

function SendProvider({ navigation, route }) {
  const { country, transferType } = route.params;
  const [provider, setProvider] = React.useState("");

  const providers = providerMap[country]?.[transferType] || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Select Provider" navigation={navigation} />
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={provider} onValueChange={setProvider}>
          <Picker.Item label="-- Choose Provider --" value="" />
          {providers.map((p) => (
            <Picker.Item key={p} label={p} value={p} />
          ))}
        </Picker>
      </View>
      <PrimaryButton
        text="Next"
        disabled={!provider}
        onPress={() => navigation.navigate("SendPhone", { country, transferType, provider })}
      />
    </ScrollView>
  );
}



function SendReview({ route, navigation }) {
  const { country, transferType, provider, phone, amount } = route.params;
  const [loading, setLoading] = React.useState(false);

  const handleConfirmAndSend = async () => {
    setLoading(true);
    try {
      const description = `Send to ${phone} via ${provider} (${country}, ${transferType})`;
      const redirectUrl = "https://futapay.app";

      const payment = await createMolliePayment({
        amount: Number(amount).toFixed(2),
        description,
        redirectUrl,
      });

      if (payment?._links?.checkout?.href) {
        await WebBrowser.openBrowserAsync(payment._links.checkout.href);
        navigation.navigate("SendConfirmation");
      } else {
        Alert.alert("Error", "Could not get payment link.");
      }
    } catch (e) {
      Alert.alert("Payment (disabled)", e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Review Transaction" navigation={navigation} />
      <View style={styles.confirmBox}>
        <Text style={styles.summaryText}>Country: {country}</Text>
        <Text style={styles.summaryText}>Type: {transferType}</Text>
        <Text style={styles.summaryText}>Provider: {provider}</Text>
        <Text style={styles.summaryText}>Phone: {phone}</Text>
        <Text style={styles.summaryText}>Amount: €{amount}</Text>
      </View>

      <PrimaryButton
        text={loading ? "Processing..." : "✅ Confirm & Send"}
        onPress={handleConfirmAndSend}
        disabled={loading}
      />
    </ScrollView>
  );
}

function SendConfirmation({ navigation }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Transaction Sent!" navigation={navigation} showBack={false} />
      <View style={styles.confirmBox}>
        <Text style={styles.summaryText}>Your transaction was successful. 🎉</Text>
      </View>
      <PrimaryButton text="Back to Home" onPress={() => navigation.navigate("Home")} />
    </ScrollView>
  );
}

// ----- RECEIVE FLOW -----
function ReceiveAmount({ navigation }) {
  const [amount, setAmount] = React.useState("");

  const isValidAmount = (a) => {
    const n = parseFloat(a);
    return !isNaN(n) && n > 0;
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Receive Money" navigation={navigation} />
      <Text style={styles.label}>Enter Amount (€)</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter amount"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <PrimaryButton
        text="Next"
        disabled={!isValidAmount(amount)}
        onPress={() => navigation.navigate("ReceiveReview", { amount })}
      />
    </ScrollView>
  );
}

function ReceiveReview({ route, navigation }) {
  const { amount } = route.params;
  const [copied, setCopied] = React.useState(false);

  const paymentLink = `https://futapay.link/${Math.floor(Math.random() * 1000000)}`;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Header title="Payment Link" navigation={navigation} />
      <View style={styles.confirmBox}>
        <Text style={styles.summaryText}>Amount: €{amount}</Text>
        <QRCode value={paymentLink} size={150} />
        <TouchableOpacity
          style={styles.copyButton}
          onPress={() => {
            Clipboard.setStringAsync(paymentLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Text style={styles.copyButtonText}>{copied ? "✅ Copied!" : "Copy Link"}</Text>
        </TouchableOpacity>
      </View>
      <PrimaryButton text="Back to Home" onPress={() => navigation.navigate("Home")} />
    </ScrollView>
  );
}

// ----- AUTH LOADING -----

function AuthLoading({ navigation }) {
  useEffect(() => {
    const check = async () => {
      const token = await AsyncStorage.getItem("userToken");
      navigation.replace(token ? "Home" : "Login");
    };

    check();
  }, [navigation]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#111827" />
      <Text style={{ marginTop: 10 }}>Checking authentication...</Text>
    </View>
  );
}


// ----- NAV -----

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="AuthLoading">
        <Stack.Screen name="AuthLoading" component={AuthLoading} />

        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Recipients" component={RecipientsScreen} />
        <Stack.Screen name="AddRecipient" component={AddRecipientScreen} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} />
        <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />

        <Stack.Screen name="SendCountry" component={SendCountry} />
        <Stack.Screen name="SendTransferType" component={SendTransferTypeScreen} />
        <Stack.Screen name="SendProvider" component={SendProvider} />
        <Stack.Screen name="SendPhone" component={SendPhoneScreen} />

        <Stack.Screen name="SendReview" component={SendReview} />
        <Stack.Screen name="SendConfirmation" component={SendConfirmation} />

        <Stack.Screen name="ReceiveAmount" component={ReceiveAmount} />
        <Stack.Screen name="ReceiveReview" component={ReceiveReview} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ----- STYLES -----
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f9f9fb",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
    color: "#111827",
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: "#6b7280",
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 14,
    borderRadius: 8,
    fontSize: 16,
    color: "#111827",
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    marginBottom: 14,
    backgroundColor: "#fff",
  },
  buttonPrimary: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  buttonPrimaryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  confirmBox: {
    marginTop: 15,
    padding: 20,
    backgroundColor: "#111827",
    borderRadius: 12,
    alignItems: "center",
  },
  summaryText: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 6,
  },
  copyButton: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  copyButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
