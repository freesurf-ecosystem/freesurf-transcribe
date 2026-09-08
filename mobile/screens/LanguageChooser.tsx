import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { deviceLang, translations } from "../i18n";
import { SUPPORTED_LANGUAGES } from "../lib/languages";

type Props = { onSelect: (code: string) => void };

/** Language chooser shown on first launch. Selecting a language persists it and enters the app. */
export default function LanguageChooser({ onSelect }: Props) {
  const detected = deviceLang();
  // Only offer languages we've actually translated (UI falls back to English otherwise).
  const offered = useMemo(
    () => SUPPORTED_LANGUAGES.filter((l) => translations[l.code]).sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose your language</Text>
        <Text style={styles.subtitle}>Used to localize the app. You can change it anytime in the menu.</Text>
        {translations[detected] && (
          <Pressable
            style={styles.detected}
            onPress={() => onSelect(detected)}
            accessibilityRole="button"
          >
            <Text style={styles.detectedText}>Use {detected.toUpperCase()}</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        data={offered}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item.code)}>
            <Text style={styles.rowText}>{item.name}</Text>
            <Text style={styles.rowCode}>{item.code.toUpperCase()}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: { paddingHorizontal: 24, paddingTop: 70, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "800", color: "#e8ecff" },
  subtitle: { fontSize: 14, color: "#8899bb", marginTop: 6 },
  detected: {
    marginTop: 14, alignSelf: "flex-start", borderWidth: 1, borderColor: "#3b6cff",
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  detectedText: { color: "#5b8cff", fontWeight: "700", fontSize: 14 },
  listContent: { paddingBottom: 40 },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1a1a1a",
  },
  rowText: { color: "#e8ecff", fontSize: 16 },
  rowCode: { color: "#5f6b7a", fontSize: 13 },
});
