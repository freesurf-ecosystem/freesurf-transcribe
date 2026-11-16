import React, { useState, useEffect, useRef } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Platform } from "react-native";
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./lib/supabase";
import { REVENUECAT_ANDROID_KEY } from "./lib/config";
import { APPSFLYER_DEV_KEY } from "./lib/config";
import { getDeviceId } from "./lib/device";
import { recordConsent } from "./lib/consent";
import Purchases from "react-native-purchases";
import appsFlyer from "react-native-appsflyer";
import TranscriberScreen from "./screens/TranscriberScreen";
import AuthScreen from "./screens/AuthScreen";
import AboutScreen from "./screens/AboutScreen";
import SubscriptionScreen from "./screens/SubscriptionScreen";
import PermissionsScreen from "./screens/PermissionsScreen";
import AIConsentScreen from "./screens/AIConsentScreen";
import LanguageChooser from "./screens/LanguageChooser";
import { useAppLanguage } from "./i18n";

const AI_CONSENT_KEY = "freesurf-transcriber-ai-consent-v2";
const AI_CONSENT_DECIDED_KEY = "freesurf-transcriber-ai-consent-decided-v2";

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#5b8cff",
    primaryContainer: "#141414",
    background: "#000000",
    surface: "#0d0d0d",
    surfaceVariant: "#141414",
    outline: "#1a1a1a",
    error: "#f87171",
    onPrimary: "#ffffff",
    onBackground: "#e8ecff",
    onSurface: "#e8ecff",
    onSurfaceVariant: "#8899bb",
  },
};

const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#3b6cff",
    primaryContainer: "#e0e7ff",
    background: "#fafafa",
    surface: "#ffffff",
    surfaceVariant: "#f0f0f5",
    outline: "#d0d0dd",
    error: "#dc2626",
    onPrimary: "#ffffff",
    onBackground: "#111827",
    onSurface: "#111827",
    onSurfaceVariant: "#6b7280",
  },
};

export type RootStackParamList = {
  Transcriber: undefined;
  Auth: undefined;
  About: undefined;
  Subscription: undefined;
  Permissions: undefined;
  Language: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [aiConsent, setAiConsent] = useState<boolean | null>(null);
  const [aiConsentDecided, setAiConsentDecided] = useState<boolean | null>(null);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const { loaded: langLoaded, chosen: langChosen, setLanguage } = useAppLanguage();
  const onboardingEventSent = useRef(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(AI_CONSENT_KEY), AsyncStorage.getItem(AI_CONSENT_DECIDED_KEY)])
      .then(([v, d]) => {
        const consent = v === "true" ? true : v === "false" ? false : null;
        setAiConsent(consent);
        setAiConsentDecided(consent !== null || d === "true");
      })
      .catch(() => {
        setAiConsent(null);
        setAiConsentDecided(false);
      });
  }, []);

  // Initialize AppsFlyer (install attribution / ad-fraud detection) at launch, before any
  // gated screens render. Android-only for now.
  useEffect(() => {
    if (Platform.OS !== "android" || !APPSFLYER_DEV_KEY || APPSFLYER_DEV_KEY.startsWith("YOUR_")) return;
    try {
      appsFlyer.initSdk(
        { devKey: APPSFLYER_DEV_KEY, isDebug: false },
        (result: any) => {
          console.log("[AppsFlyer] init success:", result);
          getDeviceId().then((deviceId) => {
            appsFlyer.setCustomerUserId(deviceId);
          }).catch(() => {});
          appsFlyer.getAppsFlyerUID((err: any, uid: string) => {
            if (err) console.log("[AppsFlyer] UID error:", err);
            else console.log("[AppsFlyer] AppsFlyer UID:", uid);
          });
        },
        (error: any) => {
          console.log("[AppsFlyer] init error:", error?.message || error);
        }
      );
    } catch (e: any) {
      console.log("[AppsFlyer] setup error:", e?.message || e);
    }
  }, []);

  // Fire the onboarding-complete event once the user has passed both gates
  // (language chosen + AI consent accepted) and reached the main screen.
  useEffect(() => {
    if (Platform.OS !== "android" || !langChosen || !aiConsent || onboardingEventSent.current) return;
    onboardingEventSent.current = true;
    try {
      appsFlyer.logEvent("af_complete_registration", {});
    } catch (e: any) {
      console.log("[AppsFlyer] onboarding event error:", e?.message || e);
    }
  }, [langChosen, aiConsent]);

  const agreeAiConsent = async () => {
    setAiConsent(true);
    setAiConsentDecided(true);
    setShowAiConsent(false);
    AsyncStorage.setItem(AI_CONSENT_KEY, "true").catch(() => {});
    AsyncStorage.setItem(AI_CONSENT_DECIDED_KEY, "true").catch(() => {});
    recordConsent("terms");
    recordConsent("ai_processing");
  };

  const declineAiConsent = async () => {
    setAiConsent(false);
    setAiConsentDecided(true);
    setShowAiConsent(false);
    AsyncStorage.setItem(AI_CONSENT_KEY, "false").catch(() => {});
    AsyncStorage.setItem(AI_CONSENT_DECIDED_KEY, "true").catch(() => {});
    recordConsent("ai_processing_declined");
  };

  const disableAiConsent = async () => {
    setAiConsent(false);
    setAiConsentDecided(true);
    AsyncStorage.setItem(AI_CONSENT_KEY, "false").catch(() => {});
    AsyncStorage.setItem(AI_CONSENT_DECIDED_KEY, "true").catch(() => {});
    recordConsent("ai_processing_revoked");
  };

  // Configure RevenueCat (Google Play) once at launch. appUserID = device id so the worker
  // can verify the entitlement server-side.
  useEffect(() => {
    if (!langChosen || Platform.OS !== "android") return;
    (async () => {
      try {
        const appUserID = await getDeviceId();
        Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY, appUserID });
      } catch (e: any) {
        console.log("[Purchases] configure error:", e?.message || e);
      }
    })();
  }, [langChosen]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(Boolean(s)));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === null || !langLoaded || aiConsentDecided === null) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0b1020" }}><ActivityIndicator color="#5b8cff" /></View>;
  }

  if (!langChosen) {
    return (
      <PaperProvider theme={isDark ? darkTheme : lightTheme}>
        <StatusBar style="light" />
        <LanguageChooser onSelect={setLanguage} />
      </PaperProvider>
    );
  }

  if (!aiConsentDecided || showAiConsent) {
    return (
      <PaperProvider theme={isDark ? darkTheme : lightTheme}>
        <StatusBar style="light" />
        <AIConsentScreen onAgree={agreeAiConsent} onDecline={declineAiConsent} />
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={isDark ? darkTheme : lightTheme}>
      <NavigationContainer>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: isDark ? darkTheme.colors.background : lightTheme.colors.background } }}>
        <Stack.Screen name="Transcriber">
          {(props) => (
            <TranscriberScreen isLoggedIn={session} aiConsent={Boolean(aiConsent)} onReviewAiConsent={() => setShowAiConsent(true)} onSignIn={() => props.navigation.navigate("Auth")} navigation={props.navigation} isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Auth">
          {(props) => (
            <AuthScreen onAuthenticated={() => { setSession(true); props.navigation.goBack(); }} onBack={() => props.navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="About">
          {(props) => (
            <AboutScreen onBack={() => props.navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Subscription">
          {(props) => (
            <SubscriptionScreen onBack={() => props.navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Permissions">
          {(props) => (
            <PermissionsScreen
              aiConsent={Boolean(aiConsent)}
              onSetAiConsent={(value) => { if (value) setShowAiConsent(true); else void disableAiConsent(); }}
              onReviewAiConsent={() => setShowAiConsent(true)}
              onBack={() => props.navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Language">
          {(props) => (
            <LanguageChooser onSelect={(code) => { setLanguage(code); props.navigation.goBack(); }} onBack={() => props.navigation.goBack()} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
    </PaperProvider>
  );
}