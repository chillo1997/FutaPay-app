import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./FirebaseConfig.js"; // Import initialized Firebase Auth instance

/**
 * Sign up a new user with Firebase.
 *
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Object} userCredential - Firebase user credential object.
 */
export async function firebaseSignUp(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential; // Contains user info and token
  } catch (err) {
    console.error("Error signing up:", err.message);
    throw err; // Rethrow error for the UI to handle
  }
}

/**
 * Sign in an existing user with Firebase.
 *
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Object} userCredential - Firebase user credential object.
 */
export async function firebaseSignIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential; // Contains user info and token
  } catch (err) {
    console.error("Error signing in:", err.message);
    throw err; // Rethrow error for the UI to handle
  }
}