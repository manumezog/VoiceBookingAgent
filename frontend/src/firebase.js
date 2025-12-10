// Firebase client config
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC0a_5q4xxEuW0fxsC9utkiZD35nWblAao",
  authDomain: "voicebookingagent.firebaseapp.com",
  projectId: "voicebookingagent",
  storageBucket: "voicebookingagent.appspot.com",
  messagingSenderId: "948180664298",
  appId: "1:948180664298:web:0b6b099483d046aca93c93",
  measurementId: "G-P296HS0XK2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Explicitly target deployed region to avoid callable CORS/timeout issues
export const functions = getFunctions(app, "us-central1");

export const calendarSearch = httpsCallable(functions, "calendar_search");
export const calendarCreate = httpsCallable(functions, "calendar_create");
export const storeBooking = httpsCallable(functions, "store_booking");
export const llmAgent = httpsCallable(functions, "llm_agent");
export const getRealtimeToken = httpsCallable(functions, "get_realtime_token");
export const generateConversationSummary = httpsCallable(functions, "generate_conversation_summary");
