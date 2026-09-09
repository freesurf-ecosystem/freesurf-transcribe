import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, AppState, Platform } from "react-native";
import { Audio } from "expo-av";
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from "react-native-paper";
import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from "expo-tracking-transparency";
import { supabase } from "./lib/supabase";
import { REVENUECAT_ANDROID_KEY } from "./lib/config";
import Purchases from "react-native-purchases";
import TranscriberScreen from "./screens/TranscriberScreen";
import AuthScreen from "./screens/AuthScreen";
import AboutScreen from "./screens/AboutScreen";
import SubscriptionScreen from "./screens/SubscriptionScreen";
import LanguageChooser from "./screens/LanguageChooser";
import { useAppLanguage } from "./i18n";

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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [isDark, setIsDark] = useState(true);
  const { loaded: langLoaded, chosen: langChosen, setLanguage } = useAppLanguage();

  // Ask for mic permission once the app opens (so the first Record isn't the permission prompt).
  useEffect(() => {
    if (langChosen) Audio.requestPermissionsAsync().catch(() => {});
  }, [langChosen]);

  // Configure RevenueCat (Google Play) once at launch. Anonymous app user id by default.
  useEffect(() => {
    if (!langChosen || Platform.OS !== "android") return;
    try {
      Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });
    } catch (e: any) {
      console.log("[Purchases] configure error:", e?.message || e);
    }
  }, [langChosen]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(Boolean(s)));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let requested = false;
    const requestATT = async () => {
      if (requested) return;
      requested = true;
      try {
        const { status } = await getTrackingPermissionsAsync();
        console.log("[ATT] initial status:", status);
        if (status === "undetermined") {
          const req = await requestTrackingPermissionsAsync();
          console.log("[ATT] requested, new status:", req.status);
        }
      } catch (e: any) {
        console.log("[ATT] error:", e?.message || e);
      }
    };

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") requestATT();
    });
    if (AppState.currentState === "active") requestATT();

    return () => subscription.remove();
  }, []);

  if (session === null || !langLoaded) {
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

  return (
    <PaperProvider theme={isDark ? darkTheme : lightTheme}>
      <NavigationContainer>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: isDark ? darkTheme.colors.background : lightTheme.colors.background } }}>
        <Stack.Screen name="Transcriber">
          {(props) => (
            <TranscriberScreen isLoggedIn={session} onSignIn={() => props.navigation.navigate("Auth")} navigation={props.navigation} isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />
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
      </Stack.Navigator>
    </NavigationContainer>
    </PaperProvider>
  );
}