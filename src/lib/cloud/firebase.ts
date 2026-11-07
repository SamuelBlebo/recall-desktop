import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserPopupRedirectResolver, indexedDBLocalPersistence, initializeAuth, type Auth,
} from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "./config";
import { isDesktop } from "../persist";

let app: FirebaseApp | undefined;
let auth: Auth;
let db: Firestore;

/** Lazily starts Firebase. Firestore keeps an offline cache, so writes made offline are sent later. */
export function fb() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    // The desktop webview can't do Google popups, so it only gets email/password.
    auth = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
      ...(isDesktop() ? {} : { popupRedirectResolver: browserPopupRedirectResolver }),
    });
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  }
  return { app, auth, db };
}
