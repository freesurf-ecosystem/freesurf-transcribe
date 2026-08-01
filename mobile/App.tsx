import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import TranscriberScreen from "./screens/TranscriberScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b1020" } }}>
        <Stack.Screen name="Transcriber" component={TranscriberScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
