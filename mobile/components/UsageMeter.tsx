import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WORKER_URL } from "../lib/config";
import { getDeviceId } from "../lib/device";
import { translations, useAppLanguage } from "../i18n";

type Props = { colors: { dim: string; text: string } };

/**
 * Shows how much of the monthly free allowance is left. Renders nothing when metering is off,
 * so it's safe to show always in the menu footer.
 */
export default function UsageMeter({ colors }: Props) {
  const { lang } = useAppLanguage();
  const T = translations[lang];
  const [state, setState] = useState<"loading" | "ok" | "off">("loading");
  const [usedSec, setUsedSec] = useState(0);
  const [limitSec, setLimitSec] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const deviceId = await getDeviceId();
        const res = await fetch(`${WORKER_URL}/api/usage`, {
          headers: { "X-Device-Id": deviceId },
        });
        const data = await res.json();
        if (active && res.ok && data?.usage) {
          setUsedSec(Number(data.usage.used) || 0);
          setLimitSec(Number(data.usage.limit) || 0);
          setState("ok");
        } else if (active) {
          setState("off");
        }
      } catch {
        if (active) setState("off");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state !== "ok") return null;
  const usedMin = Math.round(usedSec / 60);
  const limitMin = Math.round(limitSec / 60);
  const pct = limitSec > 0 ? Math.min(1, usedSec / limitSec) * 100 : 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{T.freeMinutes}</Text>
      <Text style={[styles.value, { color: colors.dim }]}>
        {usedMin} / {limitMin} {T.thisMonth}
      </Text>
      <View style={[styles.track, { backgroundColor: colors.dim + "33" }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.text }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 15 },
  value: { fontSize: 13 },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 2 },
  fill: { height: "100%", borderRadius: 3 },
});
