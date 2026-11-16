import React, { useState, useRef, useEffect } from "react";
import {
  View, ScrollView, Alert, Share, Linking,
  ActivityIndicator, TextInput, TouchableOpacity, Pressable, Platform, Modal,
} from "react-native";
import {
  Text, Card, Button, Surface, useTheme, IconButton, Divider,
} from "react-native-paper";
import { Square, Share2, Trash2, EllipsisVertical, Pencil, AudioLines, Play, Pause, Radio } from "lucide-react-native";
import Slider from "@react-native-community/slider";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FloatingHamburger from "../components/FloatingHamburger";
import UsageMeter from "../components/UsageMeter";
import { translationsFor, useAppLanguage } from "../i18n";

import { WORKER_URL } from "../lib/config";
import { LIVE_MAX_AUDIO_BYTES, LIVE_MAX_REFRESHES, LIVE_MAX_SESSION_MS, LIVE_NOTES_EARLY_MS, LIVE_NOTES_EARLY_WINDOW_MS, LIVE_NOTES_LATE_MS, LIVE_REFRESH_MS } from "../lib/liveConfig";
import { getDeviceId } from "../lib/device";
import appsFlyer from "react-native-appsflyer";
const HISTORY_KEY = "freesurf-transcriber-history";
const SPEAKER_COLORS = ["#5b8cff", "#78e6c4", "#f0a060", "#c084fc", "#60c0f0"];
let firstTranscriptionSent = false;

type Props = { isLoggedIn: boolean; aiConsent: boolean; onReviewAiConsent: () => void; onSignIn: () => void; navigation?: any; isDark?: boolean; onToggleTheme?: () => void; };

type Segment = { speaker: string; start: number; end: number; text: string; };
type HistoryEntry = { id: string; title: string; text: string; segments?: Segment[]; notes?: string; speakerNames?: Record<string, string>; audioUri?: string; date: number; };

const LIVE_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: ".aac",
    outputFormat: Audio.AndroidOutputFormat.AAC_ADTS,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".wav",
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};


function overlapSeconds(a: Segment, b: Segment): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function speakerNumber(speaker: string): number {
  const m = speaker.match(/\d+$/);
  return m ? parseInt(m[0], 10) : 0;
}

function mergeLiveSegments(previous: Segment[], incoming: Segment[]): Segment[] {
  if (!incoming.length) return previous;
  if (!previous.length) {
    const order: string[] = [];
    for (const s of incoming) if (!order.includes(s.speaker)) order.push(s.speaker);
    const map = new Map(order.map((s, i) => [s, `SPEAKER_${String(i).padStart(2, "0")}`]));
    const normalized = incoming.map(s => ({ ...s, speaker: map.get(s.speaker) || s.speaker }));
    const totals = new Map<string, number>();
    for (const s of normalized) {
      totals.set(s.speaker, (totals.get(s.speaker) || 0) + (s.end - s.start));
    }
    const out = normalized.map(s => ({ ...s }));
    for (const [short, total] of totals) {
      if (total >= 1.5 || totals.size <= 1) continue;
      for (const s of out) {
        if (s.speaker !== short) continue;
        const mid = (s.start + s.end) / 2;
        let best: Segment | null = null;
        for (const other of out) {
          if (other.speaker === short) continue;
          const d = Math.abs((other.start + other.end) / 2 - mid);
          if (!best || d < Math.abs((best.start + best.end) / 2 - mid)) best = other;
        }
        if (best) s.speaker = best.speaker;
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  const local = new Map<string, Segment[]>();
  for (const s of incoming) {
    if (!local.has(s.speaker)) local.set(s.speaker, []);
    local.get(s.speaker)!.push(s);
  }
  const order = [...local.keys()].sort((a, b) => {
    const sa = local.get(a)![0].start;
    const sb = local.get(b)![0].start;
    return sa - sb;
  });
  let next = 0;
  for (const p of previous) next = Math.max(next, speakerNumber(p.speaker) + 1);
  const map = new Map<string, string>();
  for (const label of order) {
    const turns = local.get(label)!;
    const total = turns.reduce((n, s) => n + (s.end - s.start), 0);
    const votes = new Map<string, number>();
    for (const s of turns) {
      for (const p of previous) {
        const ov = overlapSeconds(s, p);
        if (ov > 0) votes.set(p.speaker, (votes.get(p.speaker) || 0) + ov);
      }
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 0.35) {
      map.set(label, best[0]);
    } else if (total < 1.5) {
      const mid = (turns[0].start + turns[turns.length - 1].end) / 2;
      let nearest: Segment | null = null;
      for (const p of previous) {
        if (!nearest || Math.abs((p.start + p.end) / 2 - mid) < Math.abs((nearest.start + nearest.end) / 2 - mid)) nearest = p;
      }
      map.set(label, nearest ? nearest.speaker : `SPEAKER_${String(next++).padStart(2, "0")}`);
    } else {
      map.set(label, `SPEAKER_${String(next++).padStart(2, "0")}`);
    }
  }
  const previousSpeakerCount = new Set(previous.map(s => s.speaker)).size;
  const incomingSpeakerCount = new Set(incoming.map(s => s.speaker)).size;
  const preservePreviousSpeakers = previousSpeakerCount > 1 && incomingSpeakerCount < previousSpeakerCount;
  const stabilized = incoming.map(s => ({ ...s, speaker: map.get(s.speaker) || s.speaker }));
  const out = [...previous];
  for (const s of stabilized) {
    const idx = out.findIndex(p => overlapSeconds(p, s) > 0.35 || Math.abs(p.start - s.start) < 0.25);
    if (idx >= 0) {
      out[idx] = preservePreviousSpeakers ? { ...s, speaker: out[idx].speaker } : s;
    } else {
      out.push(s);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export default function TranscriberScreen({ isLoggedIn, aiConsent, onReviewAiConsent, onSignIn, navigation, isDark, onToggleTheme }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + 12;
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultMenuOpen, setResultMenuOpen] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioSoundRef = useRef<Audio.Sound | null>(null);
  const isSeekingRef = useRef(false);
  const [audioPos, setAudioPos] = useState(0);   // ms
  const [audioDur, setAudioDur] = useState(0);   // ms (0 until loaded)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [notes, setNotes] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [showMicExplainer, setShowMicExplainer] = useState(false);
  const [micCanAskAgain, setMicCanAskAgain] = useState(true);
  const [showAiExplainer, setShowAiExplainer] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<{ entryId: string; speaker: string } | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const liveActiveRef = useRef(false);
  const liveStartedAtRef = useRef(0);
  const liveRefreshesRef = useRef(0);
  const liveBusyRef = useRef(false);
  const liveLastBilledAtRef = useRef(0);
  const liveSegmentsRef = useRef<Segment[]>([]);
  const notesBusyRef = useRef(false);
  const notesLastAtRef = useRef(0);
  const notesRef = useRef("");
  const liveTimerRef = useRef<any>(null);
  const liveRefreshRef = useRef<any>(null);
  const { lang } = useAppLanguage();
  const T = translationsFor(lang);

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => () => {
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    if (liveRefreshRef.current) clearInterval(liveRefreshRef.current);
  }, []);
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

  async function startLiveRecording() {
    if (isLive || isProcessing) return;
    if (!aiConsent) {
      setShowAiExplainer(true);
      return;
    }
    try {
      const perm = await Audio.getPermissionsAsync();
      if (perm.status !== "granted") {
        setMicCanAskAgain(Platform.OS === "ios" ? perm.status !== "denied" : perm.canAskAgain !== false);
        setShowMicExplainer(true);
        return;
      }
    } catch {
      setShowMicExplainer(true);
      return;
    }
    await beginLiveRecording();
  }
  async function beginLiveRecording() {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(LIVE_RECORDING_OPTIONS, null, 500);
      recordingRef.current = recording;
      liveActiveRef.current = true;
      liveStartedAtRef.current = Date.now();
      liveLastBilledAtRef.current = Date.now();
      liveRefreshesRef.current = 0;
      liveBusyRef.current = false;
      setLiveElapsed(0);
      liveSegmentsRef.current = [];
      notesLastAtRef.current = 0;
      notesBusyRef.current = false;
      notesRef.current = "";
      setNotes("");
      setNotesBusy(false);
      setResult({ segments: [], text: "" });
      setIsLive(true);
      liveTimerRef.current = setInterval(() => {
        setLiveElapsed(Math.floor((Date.now() - liveStartedAtRef.current) / 1000));
      }, 1000);
      liveRefreshRef.current = setInterval(() => { void refreshLive(); }, LIVE_REFRESH_MS);
    } catch (e: any) {
      console.error("[Transcriber] Live record error:", e?.message ?? e);
      Alert.alert(T.errorTitle, e?.message || T.couldNotStartRecording);
    }
  }
  async function refreshLive() {
    if (!liveActiveRef.current || liveBusyRef.current) return;
    if (Date.now() - liveStartedAtRef.current >= LIVE_MAX_SESSION_MS || liveRefreshesRef.current >= LIVE_MAX_REFRESHES) {
      Alert.alert(T.errorTitle, "Live session limit reached.");
      await stopLiveRecording();
      return;
    }
    const rec = recordingRef.current;
    const uri = rec?.getURI();
    if (!uri) return;
    liveBusyRef.current = true;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return;
      if (typeof info.size === "number" && info.size > LIVE_MAX_AUDIO_BYTES) {
        Alert.alert(T.errorTitle, "Live session too large.");
        await stopLiveRecording();
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const refreshStartedAt = Date.now();
      if (base64.length > Math.ceil(LIVE_MAX_AUDIO_BYTES * 1.4)) {
        Alert.alert(T.errorTitle, "Live session too large.");
        await stopLiveRecording();
        return;
      }
      const deviceId = await getDeviceId();
      const newAudioSeconds = Math.max(1, Math.ceil((Date.now() - liveLastBilledAtRef.current) / 1000));
      const res = await fetch(`${WORKER_URL}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
        body: JSON.stringify({ audio_base64: base64, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          Alert.alert(T.errorTitle, data.error || "Live limit reached.");
          await stopLiveRecording();
          return;
        }
        throw new Error(data.error || `Transcription failed (${res.status})`);
      }
      if (!liveActiveRef.current) return;
      liveRefreshesRef.current += 1;
      liveLastBilledAtRef.current = Date.now();
      const merged = mergeLiveSegments(liveSegmentsRef.current, data.segments || []);
      liveSegmentsRef.current = merged;
      console.log("[Transcriber] Live refresh", {
        base64Chars: base64.length,
        ms: Date.now() - refreshStartedAt,
        duration: data.duration,
        incomingSegments: data.segments?.length ?? 0,
        incomingSpeakers: new Set((data.segments || []).map((s: Segment) => s.speaker)).size,
        keptSegments: merged.length,
        keptSpeakers: new Set(merged.map((s: Segment) => s.speaker)).size,
        firstStart: data.segments?.[0]?.start,
        lastEnd: data.segments?.length ? data.segments[data.segments.length - 1].end : null,
      });
      setResult({ ...data, segments: merged, text: merged.map((s: Segment) => s.text).join(" ") });
      const elapsed = Date.now() - liveStartedAtRef.current;
      const interval = elapsed < LIVE_NOTES_EARLY_WINDOW_MS ? LIVE_NOTES_EARLY_MS : LIVE_NOTES_LATE_MS;
      if (Date.now() - notesLastAtRef.current >= interval) void refreshNotes();
    } catch (e: any) {
      console.warn("[Transcriber] Live refresh error:", e?.message ?? e);
    } finally {
      liveBusyRef.current = false;
    }
  }
  async function refreshNotes() {
    if (!liveActiveRef.current || notesBusyRef.current) return;
    const transcript = formatBySpeaker(liveSegmentsRef.current).trim();
    if (!transcript) return;
    notesBusyRef.current = true;
    setNotesBusy(true);
    try {
      const deviceId = await getDeviceId();
      const res = await fetch(`${WORKER_URL}/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
        body: JSON.stringify({ transcript, previous_notes: notesRef.current, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Note taker failed (${res.status})`);
      if (!liveActiveRef.current) return;
      const nextNotes = String(data.notes || "").trim();
      notesRef.current = nextNotes;
      setNotes(nextNotes);
      notesLastAtRef.current = Date.now();
    } catch (e: any) {
      console.warn("[Transcriber] Notes refresh error:", e?.message ?? e);
    } finally {
      notesBusyRef.current = false;
      setNotesBusy(false);
    }
  }
  async function saveLiveTranscript(uri: string) {
    const segments = liveSegmentsRef.current;
    const text = segments.map(s => s.text).join(" ").trim() || String(result?.text || "").trim();
    if (!segments.length && !text) {
      await transcribeAudio(uri, uri);
      return;
    }
    setIsProcessing(true);
    setIsSaving(true);
    try {
      const savedAudioUri = await copyAudioToLibrary(uri);
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        title: T.untitled,
        text,
        segments,
        notes: notesRef.current || undefined,
        audioUri: savedAudioUri,
        date: Date.now(),
      };
      await saveHistory([entry, ...history].slice(0, 50));
      setExpandedId(entry.id);
      liveSegmentsRef.current = [];
      notesRef.current = "";
      setNotes("");
      setResult(null);
    } catch (e: any) {
      Alert.alert(T.errorTitle, e?.message || T.transcriptionFailed);
    } finally {
      setIsProcessing(false);
      setIsSaving(false);
    }
  }
  async function stopLiveRecording() {
    if (!liveActiveRef.current) return;
    liveActiveRef.current = false;
    setIsLive(false);
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    if (liveRefreshRef.current) clearInterval(liveRefreshRef.current);
    liveTimerRef.current = null;
    liveRefreshRef.current = null;
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (uri) await saveLiveTranscript(uri);
    } catch {
      Alert.alert(T.errorTitle, T.couldNotStopRecording);
    }
  }
  async function copyAudioToLibrary(sourceUri: string): Promise<string | undefined> {
    const audioDir = FileSystem.documentDirectory + "transcriber-audio/";
    await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true }).catch(() => {});
    if (!sourceUri || sourceUri.startsWith(audioDir)) return undefined;
    const ext = (sourceUri.split(".").pop() || "m4a").split("?")[0] || "m4a";
    const destUri = audioDir + `recording-${Date.now()}.${ext}`;
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
      return destUri;
    } catch {
      return undefined;
    }
  }

  async function transcribeAudio(audioUri: string, originalUri?: string) {
    setIsProcessing(true);
    setResult(null);
    try {
      const base64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
      const deviceId = await getDeviceId();
      const res = await fetch(`${WORKER_URL}/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
        body: JSON.stringify({ audio_base64: base64, language: lang }),
      });
      const data = await res.json();
      console.log("[Transcriber] Response:", JSON.stringify(data).slice(0, 200));
      if (data.error) throw new Error(data.error);

      setResult(data);

      // First successful transcription — a stronger quality signal than install/onboarding.
      if (Platform.OS === "android" && !firstTranscriptionSent) {
        firstTranscriptionSent = true;
        try {
          appsFlyer.logEvent("first_transcription", {});
        } catch (e: any) {
          console.log("[AppsFlyer] first_transcription error:", e?.message || e);
        }
      }

      // Save audio permanently
      const sourceUri = originalUri || audioUri;
      const savedAudioUri = await copyAudioToLibrary(sourceUri);

      // Build display text
      const plainText = data.segments?.map((s: Segment) => s.text).join(" ") || data.text || "";

      // Save to history
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        title: T.untitled,
        text: plainText,
        segments: data.segments || [],
        notes: notesRef.current || undefined,
        audioUri: savedAudioUri,
        date: Date.now(),
      };
      const updated = [entry, ...history].slice(0, 50);
      await saveHistory(updated);
      setExpandedId(entry.id); // show the full transcript immediately (not the collapsed preview)
      liveSegmentsRef.current = [];
      setResult(null);
    } catch (e: any) {
      const msg = e?.message || T.transcriptionFailed;
      Alert.alert(T.errorTitle, msg);
    }
    finally { setIsProcessing(false); }
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
      const { sound } = await Audio.Sound.createAsync({ uri: entry.audioUri }, { shouldPlay: true }, (status: any) => {
        if (!status) return;
        if (status.durationMillis && status.durationMillis > 0) setAudioDur(status.durationMillis);
        if (!isSeekingRef.current && typeof status.positionMillis === "number") setAudioPos(status.positionMillis);
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingAudio(false);
          setPlayingAudioId(null);
          setAudioPos(0);
        }
      });
      audioSoundRef.current = sound;
      setPlayingAudioId(entry.id);
      setAudioDur(0);
      setAudioPos(0);
      setIsPlayingAudio(true);
    } catch { Alert.alert(T.errorTitle, T.couldNotPlay); }
  }
  async function seekAudio(ms: number) {
    try { await audioSoundRef.current?.setPositionAsync(ms); } catch {}
    setAudioPos(ms);
  }
  // Seek bar shown only for the entry whose audio is currently loaded, so you can jump anywhere / to the end.
  function renderScrub(entry: HistoryEntry) {
    if (!entry.audioUri || playingAudioId !== entry.id) return null;
    const maxMs = Math.max(audioDur, 1000);
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontVariant: ["tabular-nums"] }}>
          {formatTime(Math.floor(audioPos / 1000))}
        </Text>
        <Slider
          style={{ flex: 1, height: 32 }}
          minimumValue={0}
          maximumValue={maxMs}
          value={audioPos}
          minimumTrackTintColor={theme.colors.primary}
          maximumTrackTintColor={theme.colors.outline}
          thumbTintColor={theme.colors.primary}
          disabled={audioDur <= 0}
          onSlidingStart={() => { isSeekingRef.current = true; }}
          onValueChange={(v) => { if (isSeekingRef.current) setAudioPos(v); }}
          onSlidingComplete={(v) => { isSeekingRef.current = false; seekAudio(v); }}
        />
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontVariant: ["tabular-nums"] }}>
          {formatTime(Math.floor(audioDur / 1000))}
        </Text>
      </View>
    );
  }

  async function handleShare(item: { title?: string; text?: string; segments?: Segment[]; speakerNames?: Record<string, string>; notes?: string }) {
    const parts: string[] = [];
    if (item.title?.trim()) parts.push(item.title.trim());
    const transcript = item.segments?.length ? formatBySpeaker(item.segments, item.speakerNames) : item.text || "";
    if (transcript.trim()) parts.push(transcript.trim());
    if (item.notes?.trim()) parts.push(`${T.notes}:\n${item.notes.trim()}`);
    if (parts.length) await Share.share({ message: parts.join("\n\n") });
  }
  async function handleShareAudio(entry: HistoryEntry) {
    if (entry.audioUri && await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(entry.audioUri);
    } else {
      Alert.alert(T.noAudioTitle, T.noAudioMessage);
    }
  }
  function deleteEntry(id: string) {
    const entry = history.find(e => e.id === id);
    Alert.alert(T.deleteTitle, T.deleteConfirm, [
      { text: T.cancel, style: "cancel" },
      { text: T.deleteAction, style: "destructive", onPress: async () => {
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
  function speakerName(entry: HistoryEntry, speaker: string): string {
    return entry.speakerNames?.[speaker] || formatSpeaker(speaker);
  }
  function startSpeakerRename(entry: HistoryEntry, speaker: string) {
    setExpandedId(entry.id);
    setEditingSpeaker({ entryId: entry.id, speaker });
    setSpeakerDraft(speakerName(entry, speaker));
  }
  async function saveSpeakerName(entry: HistoryEntry) {
    if (!editingSpeaker || editingSpeaker.entryId !== entry.id) return;
    const speaker = editingSpeaker.speaker;
    const name = speakerDraft.trim();
    const names = { ...(entry.speakerNames || {}) };
    if (name && name !== formatSpeaker(speaker)) names[speaker] = name;
    else delete names[speaker];
    await saveHistory(history.map(e => e.id === entry.id ? { ...e, speakerNames: names } : e));
    setEditingSpeaker(null);
    setSpeakerDraft("");
  }
  async function toggleEntry(entry: HistoryEntry, isExpanded: boolean) {
    if (editingSpeaker?.entryId === entry.id) await saveSpeakerName(entry);
    setExpandedId(isExpanded ? null : entry.id);
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
    return `${T.speaker} ${idx + 1}`;
  }
  // Rebuild a readable transcript grouped by speaker (keeps diarization structure for share/export).
  function formatBySpeaker(segments?: Segment[], speakerNames?: Record<string, string>): string {
    if (!segments?.length) return "";
    let out = "";
    let lastSpeaker = "";
    for (const seg of segments) {
      const label = speakerNames?.[seg.speaker] || formatSpeaker(seg.speaker);
      const labelWithColon = label.endsWith(":") ? label : `${label}:`;
      if (label !== lastSpeaker) {
        if (out) out += "\n\n";
        out += labelWithColon;
        lastSpeaker = label;
      }
      out += ` ${seg.text}`;
    }
    return out.trim();
  }

  const hbColors = {
    text: theme.colors.onSurface,
    dim: theme.colors.onSurfaceVariant,
    card: theme.colors.surface,
    border: theme.colors.outline,
  };

  const themeToggleFooter = onToggleTheme ? (
    <View style={{ flexDirection: "column", gap: 10 }}>
      <Pressable
        onPress={onToggleTheme}
        accessibilityLabel={T.toggleDarkMode}
        hitSlop={8}
        style={{ alignSelf: "center", padding: 6 }}
      >
        <Text style={{ fontSize: 26, color: hbColors.text }}>◐</Text>
      </Pressable>
      <UsageMeter colors={hbColors} />
    </View>
  ) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: Math.max(insets.top, 24),
          backgroundColor: theme.colors.background,
          zIndex: 50,
        }}
      />
      <FloatingHamburger
        topOffset={topPad}
        colors={hbColors}
        footer={themeToggleFooter}
        menuItems={[
          { label: T.goPro, onPress: () => navigation?.navigate("Subscription") },
          { label: T.permissions, onPress: () => navigation?.navigate("Permissions") },
          { label: T.languageLabel, onPress: () => navigation?.navigate("Language") },
          { label: T.menuSupport, onPress: () => Linking.openURL("https://freesurf.tools/support") },
          { label: T.menuPrivacy, onPress: () => Linking.openURL("https://freesurf.tools/privacy") },
          { label: T.menuTerms, onPress: () => Linking.openURL("https://freesurf.tools/terms") },
        ]}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: topPad + 48, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {isLive && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.error }} />
            <Text variant="labelMedium" style={{ color: theme.colors.error, fontWeight: "700", letterSpacing: 0.8 }}>
              {T.live} {formatTime(liveElapsed)}
            </Text>
          </View>
        )}
        {result ? (
          <>
            <Card mode="contained">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 4, paddingTop: 8, paddingBottom: 4 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{T.untitled}</Text>
                <View style={{ width: 36 }} />
              </View>
                {result.segments && result.segments.length > 0 ? (
                result.segments.map((seg: Segment, i: number) => {
                  const prev = i > 0 ? result.segments![i - 1] : null;
                  const showSpeaker = !prev || prev.speaker !== seg.speaker;
                  const color = SPEAKER_COLORS[speakerIndex(seg.speaker) % SPEAKER_COLORS.length];
                  return (
                    <View key={i} style={{ marginBottom: 12, paddingHorizontal: 16 }}>
                      {showSpeaker && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                          <Text variant="labelSmall" style={{ fontWeight: "700", color, letterSpacing: 0.5 }}>{formatSpeaker(seg.speaker)}</Text>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatTime(seg.start)}</Text>
                        </View>
                      )}
                      <Text variant="bodyLarge" style={{ fontSize: 18, lineHeight: 28 }}>{seg.text}</Text>
                    </View>
                  );
                })
              ) : (
                <Text variant="bodyLarge" style={{ lineHeight: 24, paddingHorizontal: 16 }}>{result.text || (isLive ? T.liveListening : T.noText)}</Text>
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
            {isLive && (
              <Card mode="contained" style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
                  <Text variant="titleMedium" style={{ fontWeight: "700" }}>{T.notes}</Text>
                  {notesBusy && <ActivityIndicator size="small" color={theme.colors.primary} />}
                </View>
                <Text style={{ fontSize: 18, lineHeight: 28, paddingHorizontal: 16, paddingBottom: 16, color: theme.colors.onSurface }}>
                  {notes || (notesBusy ? T.notesUpdating : T.notesEmpty)}
                </Text>
              </Card>
            )}
          </>
        ) : history.length > 0 ? (
          <>
            {history.map((entry) => {
              const isEditing = editingId === entry.id;
              const isExpanded = expandedId === entry.id;
              return (
                <Card key={entry.id} mode="contained" style={{ marginBottom: 8 }}>
                  <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          {isEditing ? (
                            <TextInput
                              style={{ fontSize: 14, fontWeight: "600", color: theme.colors.onSurface, borderBottomWidth: 1, borderBottomColor: theme.colors.primary, paddingVertical: 4, flex: 1 }}
                              value={editingTitle} onChangeText={setEditingTitle}
                              onSubmitEditing={saveRename} onBlur={saveRename} autoFocus selectTextOnFocus
                            />
                          ) : (
                            <Pressable style={{ flexShrink: 1 }} onPress={() => void toggleEntry(entry, isExpanded)}>
                              <Text variant="bodyMedium" style={{ fontWeight: "600" }} numberOfLines={1}>{entry.title}</Text>
                            </Pressable>
                          )}
                          {isExpanded && !isEditing && (
                            <Pressable onPress={() => startRename(entry)} hitSlop={8} style={{ padding: 4 }}>
                              <Pencil size={14} color={theme.colors.onSurfaceVariant} />
                            </Pressable>
                          )}
                        </View>
                        <Pressable onPress={() => void toggleEntry(entry, isExpanded)}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {new Date(entry.date).toLocaleDateString()} · {new Date(entry.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {entry.audioUri && (
                          <IconButton
                            icon={() => playingAudioId === entry.id && isPlayingAudio ? <Pause size={16} color={theme.colors.primary} /> : <Play size={16} color={theme.colors.onSurfaceVariant} />}
                            size={20} onPress={() => playAudio(entry)} style={{ margin: 0 }}
                          />
                        )}
                      </View>
                    </View>
                  </View>

                  {renderScrub(entry)}
                  {isExpanded && entry.segments && entry.segments.length > 0 && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: "700", letterSpacing: 0.5 }}>
                        {T.speakers}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        {Array.from(new Set(entry.segments.map((seg: Segment) => seg.speaker))).map((speaker: string) => {
                          const isEditingSpeaker = editingSpeaker?.entryId === entry.id && editingSpeaker.speaker === speaker;
                          if (isEditingSpeaker) {
                            return (
                              <TextInput
                                key={speaker}
                                style={{ minWidth: 130, fontSize: 14, fontWeight: "600", color: theme.colors.onSurface, borderBottomWidth: 1, borderBottomColor: theme.colors.primary, paddingVertical: 2 }}
                                value={speakerDraft}
                                onChangeText={setSpeakerDraft}
                                onSubmitEditing={() => saveSpeakerName(entry)}
                                onBlur={() => saveSpeakerName(entry)}
                                autoFocus
                                selectTextOnFocus
                              />
                            );
                          }
                          return (
                            <Pressable
                              key={speaker}
                              onPress={() => startSpeakerRename(entry, speaker)}
                              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.surfaceVariant, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.onSurface }}>{speakerName(entry, speaker)}</Text>
                              <Pencil size={12} color={theme.colors.onSurfaceVariant} />
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {entry.segments && entry.segments.length > 0 && (
<TouchableOpacity activeOpacity={0.7} onPress={() => void toggleEntry(entry, isExpanded)} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
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
                                <Text variant="labelSmall" style={{ fontWeight: "700", color, letterSpacing: 0.5 }}>{speakerName(entry, seg.speaker)}</Text>
                                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatTime(seg.start)}</Text>
                              </View>
                            )}
                            <Text variant="bodyLarge" style={{ fontSize: 18, lineHeight: 28 }}>{txt}</Text>
                          </View>
                        );
                      })}
                      {!isExpanded && entry.segments.length > 2 && (
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingTop: 4 }}>{T.tapToExpand}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {(!entry.segments || entry.segments.length === 0) && (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => void toggleEntry(entry, isExpanded)} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                      <Text variant="bodyLarge" style={{ fontSize: 18, lineHeight: 28 }}>
                        {isExpanded ? entry.text : entry.text.slice(0, 120) + (entry.text.length > 120 ? "..." : "")}
                      </Text>
                      {!isExpanded && entry.text.length > 120 && (
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingTop: 4 }}>{T.tapToExpand}</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {isExpanded && entry.notes && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: "700", letterSpacing: 0.5, marginBottom: 4 }}>{T.notes}</Text>
                      <Text style={{ fontSize: 18, lineHeight: 28, color: theme.colors.onSurface }}>{entry.notes}</Text>
                    </View>
                  )}

                  {/* Always-visible card actions (no overflow "..." menu) */}
                  <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.outline, flexDirection: "row", justifyContent: "space-around", paddingVertical: 4 }}>
                    <IconButton icon={() => <Share2 size={18} color={theme.colors.onSurface} />} onPress={() => handleShare(entry)} />
                    {entry.audioUri && (
                      <IconButton icon={() => <AudioLines size={18} color={theme.colors.onSurface} />} onPress={() => handleShareAudio(entry)} />
                    )}
                    <IconButton icon={() => <Pencil size={18} color={theme.colors.onSurface} />} onPress={() => startRename(entry)} />
                    <IconButton icon={() => <Trash2 size={18} color={theme.colors.error} />} onPress={() => deleteEntry(entry.id)} />
                  </View>
                </Card>
              );
            })}
          </>
        ) : (
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingVertical: 80 }}>
            {T.emptyState}
          </Text>
        )}
      </ScrollView>

      <Modal visible={showAiExplainer} transparent animationType="fade" onRequestClose={() => setShowAiExplainer(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 }}>
          <Surface style={{ borderRadius: 18, padding: 22, backgroundColor: theme.colors.surface }}>
            <Text variant="titleLarge" style={{ fontWeight: "800", marginBottom: 10 }}>{T.aiOffTitle}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 8 }}>
              {T.aiOffBody1}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 18 }}>
              {T.aiOffBody2}
            </Text>
            <Button
              mode="contained"
              onPress={() => { setShowAiExplainer(false); onReviewAiConsent(); }}
            >
              {T.reviewAiConsent}
            </Button>
            <Button mode="text" onPress={() => setShowAiExplainer(false)} style={{ marginTop: 6 }}>
              {T.notNow}
            </Button>
          </Surface>
        </View>
      </Modal>

      <Modal visible={showMicExplainer} transparent animationType="fade" onRequestClose={() => setShowMicExplainer(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 }}>
          <Surface style={{ borderRadius: 18, padding: 22, backgroundColor: theme.colors.surface }}>
            <Text variant="titleLarge" style={{ fontWeight: "800", marginBottom: 10 }}>{T.micAccessTitle}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 8 }}>
              {T.micAccessBody1}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginBottom: 18 }}>
              {T.micAccessBody2}
            </Text>
            <Button
              mode="contained"
              onPress={async () => {
                if (!micCanAskAgain) {
                  Linking.openSettings();
                  return;
                }
                try {
                  const perm = await Audio.requestPermissionsAsync();
                  if (perm.status === "granted") {
                    setShowMicExplainer(false);
                    await beginLiveRecording();
                  } else {
                    setMicCanAskAgain(Platform.OS === "ios" ? perm.status !== "denied" : perm.canAskAgain !== false);
                    setShowMicExplainer(false);
                  }
                } catch {}
              }}
            >
              {micCanAskAgain ? T.continueLabel : T.openSettings}
            </Button>
            <Button mode="text" onPress={() => setShowMicExplainer(false)} style={{ marginTop: 6 }}>
              {T.notNow}
            </Button>
          </Surface>
        </View>
      </Modal>

      <Surface style={{ position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", padding: 12, paddingBottom: 34, gap: 8, elevation: 2 }}>
        {isLive ? (
          <Button
            mode="contained"
            style={{ flex: 1 }}
            buttonColor={theme.colors.error}
            onPress={stopLiveRecording}
            icon={() => <Square size={16} color="#fff" />}
          >
            {T.stop}
          </Button>
        ) : isProcessing ? (
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceVariant, borderRadius: 100, gap: 8 }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{isSaving ? T.saving : T.transcribing}</Text>
          </View>
        ) : (
          <Button mode="contained" style={{ flex: 1 }} onPress={startLiveRecording} icon={() => <Radio size={16} color="#fff" />}>
            {T.record}
          </Button>
        )}
      </Surface>
    </View>
  );
}