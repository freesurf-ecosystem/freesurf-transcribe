import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./lib/supabase";
import ConsentScreen from "./screens/ConsentScreen";
import TranscriberScreen from "./screens/TranscriberScreen";
import AuthScreen from "./screens/AuthScreen";

export type RootStackParamList = {
  Consent: undefined;
  Transcriber: undefined;
  Auth: undefined;
};

const CONSENT_KEY = "freesurf-transcriber-consent-v1";
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(Boolean(s)));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const consented = await AsyncStorage.getItem(CONSENT_KEY);
        setInitialRoute(consented === "true" ? "Transcriber" : "Consent");
      } catch { setInitialRoute("Consent"); }
    })();
  }, []);

  if (session === null || !initialRoute) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0b1020" }}><ActivityIndicator color="#5b8cff" /></View>;
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator initialRouteName={initialRoute as any} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b1020" } }}>
        <Stack.Screen name="Consent" component={ConsentScreen} />
        <Stack.Screen name="Transcriber">
          {(props) => (
            <TranscriberScreen isLoggedIn={session} onSignIn={() => props.navigation.navigate("Auth")} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Auth">
          {(props) => (
            <AuthScreen onAuthenticated={() => { setSession(true); props.navigation.goBack(); }} onBack={() => props.navigation.goBack()} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
