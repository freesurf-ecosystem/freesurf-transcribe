import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Share, TextInput,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { WORKER_URL } from "../lib/config";
const HISTORY_KEY = "freesurf-transcriber-history";
const SPEAKER_COLORS = ["#5b8cff", "#78e6c4", "#f0a060", "#c084fc", "#60c0f0"];

type Segment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
};

type TranscribeResult = {
  segments?: Segment[];
  text?: string;
  language?: string;
  duration?: number;
  model?: string;
};

export default function TranscriberScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [plainText, setPlainText] = useState("");
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [viewMode, setViewMode] = useState<"segments" | "plain">("segments");

  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => { loadHistoryCount(); }, []);

  async function loadHistoryCount() {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setHistoryCount(arr.length);
    } catch {}
  }

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert("Error", "Could not start recording.");
    }
  }

  async function stopRecording() {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (uri) {
        setRecordingUri(uri);
        await transcribeAudio(uri);
      }
    } catch {
      Alert.alert("Error", "Could not stop recording.");
    }
  }

  async function transcribeAudio(uri: string) {
    setIsProcessing(true);
    setResult(null);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const res = await fetch(`${WORKER_URL}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_base64: base64 }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResult(data);
      setPlainText(data.text || "");
      setViewMode(data.segments?.length ? "segments" : "plain");

      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift({
        text: data.text,
        segments: data.segments,
        language: data.language,
        date: Date.now(),
      });
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 50)));
      setHistoryCount(arr.length);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Transcription failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setRecordingUri(file.uri);
      await transcribeAudio(file.uri);
    } catch {
      Alert.alert("Error", "Could not import file.");
    }
  }

  async function handleShare() {
    if (!plainText) return;
    await Share.share({ message: plainText });
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function speakerIndex(speaker: string): number {
    const match = speaker.match(/\d+$/);
    return match ? parseInt(match[0], 10) : 0;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>FreeSurf</Text>
        <Text style={styles.title}>Transcriber</Text>
        <Text style={styles.historyBadge}>{historyCount > 0 ? `${historyCount} saved` : ""}</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {isProcessing ? (
          <View style={styles.transcriptCard}>
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#5b8cff" />
              <Text style={styles.processingText}>Transcribing...</Text>
            </View>
          </View>
        ) : result ? (
          <>
            {result.duration != null && (
              <Text style={styles.metaText}>
                {result.duration}s · {result.language?.toUpperCase() || "?"} · {result.model || ""}
              </Text>
            )}

            {result.segments && result.segments.length > 0 && (
              <View style={styles.viewToggle}>
                <TouchableOpacity
                  onPress={() => setViewMode("segments")}
                  style={[styles.toggleBtn, viewMode === "segments" && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, viewMode === "segments" && styles.toggleTextActive]}>Speakers</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setViewMode("plain")}
                  style={[styles.toggleBtn, viewMode === "plain" && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, viewMode === "plain" && styles.toggleTextActive]}>Plain text</Text>
                </TouchableOpacity>
              </View>
            )}

            {viewMode === "segments" && result.segments ? (
              <View style={styles.transcriptCard}>
                {result.segments.map((seg, i) => {
                  const prev = i > 0 ? result.segments![i - 1] : null;
                  const showSpeaker = !prev || prev.speaker !== seg.speaker;
                  const color = SPEAKER_COLORS[speakerIndex(seg.speaker) % SPEAKER_COLORS.length];
                  return (
                    <View key={i} style={segStyles.segment}>
                      {showSpeaker && (
                        <View style={segStyles.speakerRow}>
                          <View style={[segStyles.speakerDot, { backgroundColor: color }]} />
                          <Text style={[segStyles.speakerLabel, { color }]}>{seg.speaker}</Text>
                          <Text style={segStyles.timestamp}>{formatTime(seg.start)}</Text>
                        </View>
                      )}
                      <Text style={segStyles.segmentText}>{seg.text}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.transcriptCard}>
                <TextInput
                  style={styles.transcriptText}
                  value={plainText}
                  onChangeText={setPlainText}
                  multiline
                  editable
                />
              </View>
            )}
          </>
        ) : (
          <View style={styles.transcriptCard}>
            <Text style={styles.placeholder}>
              Tap record to start transcribing, or import an audio file.
            </Text>
          </View>
        )}

        {result ? (
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareText}>Copy & Share</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
          <Text style={styles.importText}>📁 Import</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordingActive]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
        >
          <Text style={styles.recordText}>
            {isRecording ? "⏹ Stop" : "🎙 Record"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1020" },
  header: {
    flexDirection: "row", alignItems: "center", padding: 16, paddingTop: 56,
    backgroundColor: "#111937", borderBottomWidth: 1, borderBottomColor: "#2a3568", gap: 12,
  },
  brand: { fontSize: 13, fontWeight: "600", color: "#5b8cff" },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: "#e8ecff" },
  historyBadge: { fontSize: 12, color: "#5f6b7a" },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 120 },
  metaText: { color: "#5f6b7a", fontSize: 12, marginBottom: 10, paddingHorizontal: 4 },
  viewToggle: { flexDirection: "row", gap: 8, marginBottom: 12 },
  toggleBtn: {
    flex: 1, backgroundColor: "#111937", borderRadius: 10, padding: 10,
    alignItems: "center", borderWidth: 1, borderColor: "#2a3568",
  },
  toggleBtnActive: { backgroundColor: "#1e2a4a", borderColor: "#5b8cff" },
  toggleText: { color: "#5f6b7a", fontSize: 13, fontWeight: "600" },
  toggleTextActive: { color: "#5b8cff" },
  transcriptCard: {
    backgroundColor: "#111937", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#2a3568", minHeight: 250,
  },
  centered: { alignItems: "center", paddingVertical: 80 },
  processingText: { color: "#b3bddf", marginTop: 12, fontSize: 14 },
  transcriptText: { color: "#e8ecff", fontSize: 16, lineHeight: 24, minHeight: 220, textAlignVertical: "top" },
  placeholder: { color: "#5f6b7a", fontSize: 15, textAlign: "center", paddingVertical: 80 },
  shareBtn: {
    backgroundColor: "#1e2a4a", borderRadius: 10, padding: 14,
    alignItems: "center", marginTop: 16, borderWidth: 1, borderColor: "#2a3568",
  },
  shareText: { color: "#78e6c4", fontSize: 15, fontWeight: "600" },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", padding: 16, paddingBottom: 36,
    backgroundColor: "#111937", borderTopWidth: 1, borderTopColor: "#2a3568", gap: 12,
  },
  importBtn: {
    flex: 1, backgroundColor: "#1e2a4a", borderRadius: 12,
    padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#2a3568",
  },
  importText: { color: "#e8ecff", fontSize: 15, fontWeight: "600" },
  recordBtn: {
    flex: 2, backgroundColor: "#5b8cff", borderRadius: 12,
    padding: 16, alignItems: "center",
  },
  recordingActive: { backgroundColor: "#ef4444" },
  recordText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

const segStyles = StyleSheet.create({
  segment: { marginBottom: 12 },
  speakerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  speakerDot: { width: 8, height: 8, borderRadius: 4 },
  speakerLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  timestamp: { fontSize: 11, color: "#5f6b7a", marginLeft: 4 },
  segmentText: { color: "#e8ecff", fontSize: 15, lineHeight: 22, paddingLeft: 0 },
});
