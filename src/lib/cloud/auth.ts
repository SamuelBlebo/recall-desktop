import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut,
} from "firebase/auth";
import { fb } from "./firebase";

export const signInEmail = (email: string, password: string) => signInWithEmailAndPassword(fb().auth, email, password);
export const signUpEmail = (email: string, password: string) => createUserWithEmailAndPassword(fb().auth, email, password);
export const signInGoogle = () => signInWithPopup(fb().auth, new GoogleAuthProvider());
export const resetPassword = (email: string) => sendPasswordResetEmail(fb().auth, email);
export const signOut = () => fbSignOut(fb().auth);

/** Turns Firebase error codes into plain sentences. */
export function authError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  return (
    {
      "auth/invalid-credential": "Wrong email or password.",
      "auth/invalid-email": "That email address doesn't look right.",
      "auth/user-not-found": "No account with that email. Create one instead.",
      "auth/wrong-password": "Wrong email or password.",
      "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
      "auth/weak-password": "Use at least 6 characters for the password.",
      "auth/network-request-failed": "No internet connection.",
      "auth/popup-closed-by-user": "The Google window was closed.",
      "auth/operation-not-allowed": "This sign-in method isn't turned on in the Firebase console.",
    }[code] ?? String((e as Error)?.message || e)
  );
}
