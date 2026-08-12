import React, { useState, useRef, useEffect } from "react";
import {
  View, ScrollView, Alert, Share, Linking,
  ActivityIndicator, Switch, TextInput, TouchableOpacity,
} from "react-native";
import {
  Text, Card, Button, Surface, useTheme, IconButton, Divider,
} from "react-native-paper";
import { Mic, Square, FolderOpen, Share2, Trash2, EllipsisVertical, Pencil, AudioLines, Play, Pause } from "lucide-react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FloatingHamburger from "../components/FloatingHamburger";

import { WORKER_URL } from "../lib/config";
const HISTORY_KEY = "freesurf-transcriber-history";
const SPEAKER_COLORS = ["#5b8cff", "#78e6c4", "#f0a060", "#c084fc", "#60c0f0"];

type Props = { isLoggedIn: boolean; onSignIn: () => void; navigation?: any; isDark?: boolean; onToggleTheme?: () => void; };

type Segment = { speaker: string; start: number; end: number; text: string; };
type HistoryEntry = { id: string; title: string; text: string; segments?: Segment[]; audioUri?: string; date: number; };

export default function TranscriberScreen({ isLoggedIn, onSignIn, navigation, isDark, onToggleTheme }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + 12;
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultMenuOpen, setResultMenuOpen] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioSoundRef = useRef<Audio.Sound | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => { loadHistory(); }, []);
  async function loadHistory() {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }
  async function saveHistory(items: HistoryEntry[]) {
    setHistory(items);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  }

  async function startRecording() {
    try {
      let perm = await Audio.requestPermissionsAsync();
      if (perm.status !== "granted") {
        await new Promise(r => setTimeout(r, 500));
        perm = await Audio.requestPermissionsAsync();
      }
      if (perm.status !== "granted") {
        Alert.alert("Permission needed", "Please tap the record button one more time.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e: any) {
      console.error("[Transcriber] Record error:", e?.message ?? e);
      Alert.alert("Error", e?.message || "Could not start recording.");
    }
  }
  async function stopRecording() {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (uri) transcribeAudio(uri, uri);
    } catch { Alert.alert("Error", "Could not stop recording."); }
  }
  async function transcribeAudio(audioUri: string, originalUri?: string) {
    setIsProcessing(true);
    setResult(null);
    try {
      const base64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
      const res = await fetch(`${WORKER_URL}/api/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio_base64: base64 }) });
      const data = await res.json();
      console.log("[Transcriber] Response:", JSON.stringify(data).slice(0, 200));
      if (data.error) throw new Error(data.error);

      setResult(data);

      // Save audio permanently
      let savedAudioUri: string | undefined;
      const audioDir = FileSystem.documentDirectory + "transcriber-audio/";
      await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true }).catch(() => {});
      const sourceUri = originalUri || audioUri;
      if (sourceUri && !sourceUri.startsWith(audioDir)) {
        const fname = `recording-${Date.now()}.m4a`;
        const destUri = audioDir + fname;
        try {
          await FileSystem.copyAsync({ from: sourceUri, to: destUri });
          savedAudioUri = destUri;
        } catch {}
      }

      // Build display text
      const plainText = data.segments?.map((s: Segment) => s.text).join(" ") || data.text || "";

      // Save to history
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        title: "Untitled transcript",
        text: plainText,
        segments: data.segments || [],
        audioUri: savedAudioUri,
        date: Date.now(),
      };
      const updated = [entry, ...history].slice(0, 50);
      await saveHistory(updated);
      setResult(null);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Transcription failed.");
    }
    finally { setIsProcessing(false); }
  }
  async function handleImport() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["audio/*"], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      transcribeAudio(r.assets[0].uri, r.assets[0].uri);
    } catch { Alert.alert("Error", "Could not import file."); }
  }
  async function playAudio(entry: HistoryEntry) {
    if (!entry.audioUri) return;
    if (playingAudioId === entry.id && isPlayingAudio) {
      await audioSoundRef.current?.pauseAsync();
      setIsPlayingAudio(false);
      return;
    }
    await audioSoundRef.current?.unloadAsync().catch(() => {});
    if (playingAudioId === entry.id) {
      await audioSoundRef.current?.playAsync();
      setIsPlayingAudio(true);
      return;
    }
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: entry.audioUri }, { shouldPlay: true }, (status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingAudio(false);
          setPlayingAudioId(null);
        }
      });
      audioSoundRef.current = sound;
      setPlayingAudioId(entry.id);
      setIsPlayingAudio(true);
    } catch { Alert.alert("Error", "Could not play audio."); }
  }

  async function handleShare(item: { text?: string; segments?: Segment[] }) {
    const txt = item.text || item.segments?.map((s) => s.text).join(" ") || "";
    if (txt) await Share.share({ message: txt });
  }
  async function handleShareAudio(entry: HistoryEntry) {
    if (entry.audioUri && await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(entry.audioUri);
    } else {
      Alert.alert("No audio", "Original recording not available.");
    }
  }
  function deleteEntry(id: string) {
    const entry = history.find(e => e.id === id);
    Alert.alert("Delete", "Delete this transcription?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (entry?.audioUri) FileSystem.deleteAsync(entry.audioUri, { idempotent: true }).catch(() => {});
        await saveHistory(history.filter(e => e.id !== id));
        if (openMenuId === id) setOpenMenuId(null);
      }},
    ]);
  }
  function startRename(entry: HistoryEntry) {
    setEditingId(entry.id);
    setEditingTitle(entry.title);
    setOpenMenuId(null);
  }
  async function saveRename() {
    if (!editingId || !editingTitle.trim()) { setEditingId(null); return; }
    await saveHistory(history.map(e => e.id === editingId ? { ...e, title: editingTitle.trim() } : e));
    setEditingId(null);
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return `${m}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }
  function speakerIndex(speaker: string): number {
    const match = speaker.match(/\d+$/);
    return match ? parseInt(match[0], 10) : 0;
  }
  function formatSpeaker(speaker: string): string {
    const idx = speakerIndex(speaker);
    return `Speaker ${idx + 1}`;
  }

  const themeToggleFooter = onToggleTheme ? (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <Switch value={!isDark} onValueChange={onToggleTheme} trackColor={{ true: isDark ? "#ffffff" : "#111827", false: "#555" }} />
    </View>
  ) : undefined;

  const hbColors = {
    text: theme.colors.onSurface,
    dim: theme.colors.onSurfaceVariant,
    card: theme.colors.surface,
    border: theme.colors.outline,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FloatingHamburger
        topOffset={topPad}
        colors={hbColors}
        footer={themeToggleFooter}
        menuItems={[
          { label: "About Us", onPress: () => navigation?.navigate("About") },
          { label: "Support", onPress: () => Linking.openURL("https://freesurf.tools/support") },
          { label: "Privacy", onPress: () => Linking.openURL("https://freesurf.tools/privacy") },
          { label: "Terms", onPress: () => Linking.openURL("https://freesurf.tools/terms") },
        ]}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: topPad + 48, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {result ? (
          <>
            <Card mode="contained">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 4, paddingTop: 8, paddingBottom: 4 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Untitled transcript</Text>
                <View style={{ width: 36 }} />
              </View>
                {result.segments && result.segments.length > 0 ? (
                result.segments.map((seg: Segment, i: number) => {
                  const prev = i > 0 ? result.segments![i - 1] : null;
                  const showSpeaker = !prev || prev.speaker !== seg.speaker;
                  const color = SPEAKER_COLORS[speakerIndex(seg.speaker) % SPEAKER_COLORS.length];
                  return (
                    <View key={i} style={{ marginBottom: 12 }}>
                      {showSpeaker && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                          <Text variant="labelSmall" style={{ fontWeight: "700", color, letterSpacing: 0.5 }}>{formatSpeaker(seg.speaker)}</Text>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatTime(seg.start)}</Text>
                        </View>
                      )}
                      <Text variant="bodyMedium" style={{ lineHeight: 22 }}>{seg.text}</Text>
                    </View>
                  );
                })
              ) : (
                <Text variant="bodyLarge" style={{ lineHeight: 24, paddingHorizontal: 16 }}>{result.text || "No text returned"}</Text>
              )}
              {resultMenuOpen && (
                <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.outline, flexDirection: "row", justifyContent: "space-around", paddingVertical: 4 }}>
                  <IconButton icon={() => <Share2 size={18} color={theme.colors.onSurface} />} onPress={() => { setResultMenuOpen(false); handleShare(result); }} />
                  <IconButton icon={() => <Trash2 size={18} color={theme.colors.error} />} onPress={() => { setResultMenuOpen(false); setResult(null); }} />
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingRight: 4, paddingBottom: 4 }}>
                <IconButton icon={() => <EllipsisVertical size={18} color={theme.colors.onSurface} />} onPress={() => setResultMenuOpen(!resultMenuOpen)} />
              </View>
            </Card>
          </>
        ) : history.length > 0 ? (
          <>
            {history.map((entry) => {
              const isMenuOpen = openMenuId === entry.id;
              const isEditing = editingId === entry.id;
              const isExpanded = expandedId === entry.id;
              return (
                <Card key={entry.id} mode="contained" style={{ marginBottom: 8 }}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setExpandedId(isExpanded ? null : entry.id)}>
                    <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1 }}>
                          {isEditing ? (
                            <TextInput
                              style={{ fontSize: 14, fontWeight: "600", color: theme.colors.onSurface, borderBottomWidth: 1, borderBottomColor: theme.colors.primary, paddingVertical: 4 }}
                              value={editingTitle} onChangeText={setEditingTitle}
                              onSubmitEditing={saveRename} onBlur={saveRename} autoFocus selectTextOnFocus
                            />
                          ) : (
                            <Text variant="bodyMedium" style={{ fontWeight: "600" }} numberOfLines={1}>{entry.title}</Text>
                          )}
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {new Date(entry.date).toLocaleDateString()} · {new Date(entry.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          {entry.audioUri && (
                            <IconButton
                              icon={() => playingAudioId === entry.id && isPlayingAudio ? <Pause size={16} color={theme.colors.primary} /> : <Play size={16} color={theme.colors.onSurfaceVariant} />}
                              size={20} onPress={() => playAudio(entry)} style={{ margin: 0 }}
                            />
                          )}
                          <IconButton icon={() => <EllipsisVertical size={18} color={theme.colors.onSurface} />} onPress={() => setOpenMenuId(isMenuOpen ? null : entry.id)} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {entry.segments && entry.segments.length > 0 && (
<TouchableOpacity activeOpacity={0.7} onPress={() => setExpandedId(isExpanded ? null : entry.id)} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                      {entry.segments.slice(0, isExpanded ? entry.segments.length : 2).map((seg: Segment, i: number) => {
                        const prev = i > 0 ? entry.segments![i - 1] : null;
                        const showSpeaker = !prev || prev.speaker !== seg.speaker;
                        const color = SPEAKER_COLORS[speakerIndex(seg.speaker) % SPEAKER_COLORS.length];
                        const txt = isExpanded ? seg.text : seg.text.slice(0, 60) + (seg.text.length > 60 ? "..." : "");
                        return (
                          <View key={i} style={{ marginBottom: 8 }}>
                            {showSpeaker && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
                                <Text variant="labelSmall" style={{ fontWeight: "700", color, letterSpacing: 0.5 }}>{formatSpeaker(seg.speaker)}</Text>
                                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatTime(seg.start)}</Text>
                              </View>
                            )}
                            <Text variant="bodyMedium" style={{ lineHeight: 21 }}>{txt}</Text>
                          </View>
                        );
                      })}
                      {!isExpanded && entry.segments.length > 2 && (
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingTop: 4 }}>Tap to expand...</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {(!entry.segments || entry.segments.length === 0) && (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setExpandedId(isExpanded ? null : entry.id)} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                      <Text variant="bodyMedium" style={{ lineHeight: 21 }}>
                        {isExpanded ? entry.text : entry.text.slice(0, 120) + (entry.text.length > 120 ? "..." : "")}
                      </Text>
                      {!isExpanded && entry.text.length > 120 && (
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingTop: 4 }}>Tap to expand...</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {isMenuOpen && (
                    <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.outline, flexDirection: "row", justifyContent: "space-around", paddingVertical: 4 }}>
                      <IconButton icon={() => <Share2 size={18} color={theme.colors.onSurface} />} onPress={() => handleShare(entry)} />
                      {entry.audioUri && (
                        <IconButton icon={() => <AudioLines size={18} color={theme.colors.onSurface} />} onPress={() => handleShareAudio(entry)} />
                      )}
                      <IconButton icon={() => <Pencil size={18} color={theme.colors.onSurface} />} onPress={() => startRename(entry)} />
                      <IconButton icon={() => <Trash2 size={18} color={theme.colors.error} />} onPress={() => deleteEntry(entry.id)} />
                    </View>
                  )}
                </Card>
              );
            })}
          </>
        ) : (
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingVertical: 80 }}>
            Tap record to start transcribing, or import an audio file.
          </Text>
        )}
      </ScrollView>

      <Surface style={{ position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", padding: 12, paddingBottom: 34, gap: 12, elevation: 2 }}>
        <Button mode="outlined" style={{ flex: 1 }} onPress={handleImport} disabled={isProcessing} icon={() => <FolderOpen size={18} color={theme.colors.onSurface} />}>
          Import
        </Button>
        {isProcessing ? (
          <View style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceVariant, borderRadius: 100, gap: 8 }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Transcribing...</Text>
          </View>
        ) : (
          <Button
            mode="contained"
            style={{ flex: 2 }}
            buttonColor={isRecording ? theme.colors.error : theme.colors.primary}
            onPress={isRecording ? stopRecording : startRecording}
            icon={() => isRecording ? <Square size={16} color="#fff" /> : <Mic size={16} color="#fff" />}
          >
            {isRecording ? "Stop" : "Record"}
          </Button>
        )}
      </Surface>
    </View>
  );
}