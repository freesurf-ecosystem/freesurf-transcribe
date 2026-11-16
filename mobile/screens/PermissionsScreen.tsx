import React, { useEffect, useState } from "react";
import { View, ScrollView, Linking, Platform } from "react-native";
import { Text, Button, Switch, useTheme, IconButton } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { translationsFor, useAppLanguage } from "../i18n";

const PRIVACY_URL = "https://freesurf.tools/privacy";
const TERMS_URL = "https://freesurf.tools/terms";
const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const SUPPORT_EMAIL = "support@freesurf.tools";

type Props = {
  aiConsent: boolean;
  onSetAiConsent: (value: boolean) => void;
  onReviewAiConsent: () => void;
  onBack: () => void;
};

export default function PermissionsScreen({ aiConsent, onSetAiConsent, onReviewAiConsent, onBack }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { lang } = useAppLanguage();
  const T = translationsFor(lang);
  const [micStatus, setMicStatus] = useState("undetermined");
  const [canAskAgain, setCanAskAgain] = useState(true);

  async function loadMic() {
    try {
      const p = await Audio.getPermissionsAsync();
      setMicStatus(p.status);
      setCanAskAgain(p.canAskAgain !== false);
    } catch {
      setMicStatus("undetermined");
    }
  }

  useEffect(() => { loadMic(); }, []);

  async function requestMic() {
    try {
      const p = await Audio.requestPermissionsAsync();
      setMicStatus(p.status);
      setCanAskAgain(p.canAskAgain !== false);
    } catch {}
  }

  const linkStyle = { color: theme.colors.primary, textDecorationLine: "underline" as const, fontSize: 15 };
  const sectionTitle = { fontWeight: "700" as const, marginTop: 26, marginBottom: 6 };
  const micLabel = micStatus === "granted" ? T.micAllowed : micStatus === "denied" ? T.micDenied : T.micNotRequested;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 12, paddingBottom: 36 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -8, marginBottom: 6 }}>
          <IconButton icon="arrow-left" size={22} onPress={onBack} />
        </View>

        <Text variant="headlineSmall" style={{ fontWeight: "800", marginBottom: 10 }}>{T.permissionsTitle}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 4 }}>
          {T.permissionsIntro}
        </Text>

        <Text variant="titleMedium" style={sectionTitle}>{T.aiSectionTitle}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
          {T.aiSectionBody}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: aiConsent ? theme.colors.primary : theme.colors.error }}>
            {aiConsent ? T.aiAllowed : T.aiNotAllowed}
          </Text>
          <Switch
            value={aiConsent}
            onValueChange={(value) => {
              if (value) onReviewAiConsent();
              else onSetAiConsent(false);
            }}
          />
        </View>
        {!aiConsent && (
          <Button mode="outlined" onPress={onReviewAiConsent} style={{ marginTop: 10 }}>
            {T.reviewAiConsent}
          </Button>
        )}

        <Text variant="titleMedium" style={sectionTitle}>{T.micTitle}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
          {T.micBody}
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: micStatus === "granted" ? theme.colors.primary : theme.colors.error, marginTop: 12 }}>
          {micLabel}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {micStatus !== "granted" && canAskAgain && (
            <Button mode="outlined" onPress={requestMic}>{T.requestAccess}</Button>
          )}
          <Button mode="outlined" onPress={() => Linking.openSettings()}>{T.openSettings}</Button>
        </View>

        <Text variant="titleMedium" style={sectionTitle}>{T.legalTitle}</Text>
        <Text style={linkStyle} onPress={() => Linking.openURL(PRIVACY_URL)}>{T.privacyPolicyLabel}</Text>
        <Text style={[linkStyle, { marginTop: 10 }]} onPress={() => Linking.openURL(TERMS_URL)}>{T.termsOfServiceLabel}</Text>
        {Platform.OS === "ios" && (
          <Text style={[linkStyle, { marginTop: 10 }]} onPress={() => Linking.openURL(APPLE_EULA_URL)}>{T.termsOfUseEulaLabel}</Text>
        )}
        <Text style={[linkStyle, { marginTop: 10 }]} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>{SUPPORT_EMAIL}</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 14, lineHeight: 19 }}>
          {T.supportDeleteBefore} {SUPPORT_EMAIL}.
        </Text>
      </ScrollView>
    </View>
  );
}
