import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {

  apiKey: "AIzaSyAYUOFmFi1GoFVfnTDKzwcRqNWVhvxvoXo",

  authDomain: "futapay-e33df.firebaseapp.com",

  projectId: "futapay-e33df",

  storageBucket: "futapay-e33df.firebasestorage.app",

  messagingSenderId: "685461105600",

  appId: "1:685461105600:web:003bedeecb18c39466f625"

};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

export { app, auth };
