import React, { useState } from "react";
import { View, ScrollView, Pressable, Linking } from "react-native";
import { Text, Button, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { translationsFor, useAppLanguage } from "../i18n";

type Props = { onAgree: () => void; onDecline: () => void };

const TERMS_URL = "https://freesurf.tools/terms";
const PRIVACY_URL = "https://freesurf.tools/privacy";
const AI_URL = "https://freesurf.tools/privacy#ai-processing";
const SUPPORT_EMAIL = "support@freesurf.tools";

function Checkbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: theme.colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: checked ? theme.colors.primary : "transparent" }}>
      {checked && <Text style={{ color: theme.colors.onPrimary, fontWeight: "800", fontSize: 16 }}>✓</Text>}
    </Pressable>
  );
}

export default function AIConsentScreen({ onAgree, onDecline }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { lang } = useAppLanguage();
  const T = translationsFor(lang);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [aiAgreed, setAiAgreed] = useState(false);
  const linkStyle = { color: theme.colors.primary, textDecorationLine: "underline" as const };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, paddingBottom: 32 }}>
        <Text variant="headlineSmall" style={{ fontWeight: "800", marginBottom: 10 }}>{T.aiTitle}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 20 }}>
          {T.aiIntro}
        </Text>

        <Text variant="titleMedium" style={{ fontWeight: "700", marginBottom: 8 }}>{T.aiProcessingTitle}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 10 }}>
          {T.aiDataBody}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 10 }}>
          {T.aiPolicyBody}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 20 }}>
          {T.aiDeleteBefore}{" "}
          <Text style={linkStyle} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>{SUPPORT_EMAIL}</Text>
          {" "}{T.aiDeleteAfter}
        </Text>

        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 20 }}>
          {T.aiDeclineNote}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <Checkbox checked={termsAgreed} onPress={() => setTermsAgreed(!termsAgreed)} />
          <Text style={{ flex: 1, fontSize: 15, color: theme.colors.onSurface, lineHeight: 21 }}>
            {T.aiTermsPrefix}{" "}
            <Text style={linkStyle} onPress={() => Linking.openURL(TERMS_URL)}>{T.termsOfServiceLabel}</Text>
            {" "}{T.aiTermsAnd}{" "}
            <Text style={linkStyle} onPress={() => Linking.openURL(PRIVACY_URL)}>{T.privacyPolicyLabel}</Text>.
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 28 }}>
          <Checkbox checked={aiAgreed} onPress={() => setAiAgreed(!aiAgreed)} />
          <Text style={{ flex: 1, fontSize: 15, color: theme.colors.onSurface, lineHeight: 21 }}>
            {T.aiConsentPrefix}{" "}
            <Text style={linkStyle} onPress={() => Linking.openURL(AI_URL)}>{T.aiConsentLink}</Text>
            {T.aiConsentSuffix}
          </Text>
        </View>

        <Button mode="contained" disabled={!termsAgreed || !aiAgreed} onPress={onAgree} contentStyle={{ height: 54 }} labelStyle={{ fontSize: 17, fontWeight: "700" }}>
          {T.aiAgree}
        </Button>
        <Button mode="text" onPress={onDecline} style={{ marginTop: 8 }} labelStyle={{ fontSize: 15 }}>
          {T.aiDecline}
        </Button>
      </ScrollView>
    </View>
  );
}
