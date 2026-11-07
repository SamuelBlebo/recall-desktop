// Firebase web config (not secret; access is controlled by firestore.rules).
// From: firebase apps:sdkconfig web --project recall-dp-app
export const firebaseConfig = {
  apiKey: "AIzaSyCeLWnJZf0OztNjBlsHRDnlWz67TqLJ45k",
  authDomain: "recall-dp-app.firebaseapp.com",
  projectId: "recall-dp-app",
  storageBucket: "recall-dp-app.firebasestorage.app",
  messagingSenderId: "571352852543",
  appId: "1:571352852543:web:5b54bdb78c7de2eeb2308a",
};

export const cloudConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.projectId;
