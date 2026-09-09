import { useEffect, useState } from "react";
import { getLocales } from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Strings = Record<string, string>;

export type Lang = string; // any ISO code present in translations

export const translations: Record<Lang, Strings> = {
  en: {
    import: "Import", record: "Record", stop: "Stop", transcribing: "Transcribing…",
    emptyState: "Tap record to start transcribing, or import an audio file.",
    untitled: "Untitled transcript", noText: "No text returned", speaker: "Speaker",
    tapToExpand: "Tap to expand...", menuSupport: "Support", menuPrivacy: "Privacy",
    menuTerms: "Terms", freeMinutes: "Free credits", thisMonth: "this month",
    goPro: "Go Pro", proBadge: "PRO", proTitle: "Transcriber Pro",
    proSubtitle: "Unlimited transcription for power users.",
    proPrice: "$20", proPerMonth: "/ month",
    featureUnlimited: "Unlimited transcription minutes",
    featureNoAds: "No ads",
    subscribeCta: "Subscribe", restoreCta: "Restore Purchase",
    activatedMsg: "Subscription activated. Enjoy Pro!",
    restoredMsg: "Your purchases have been restored.",
    cancelAnytime: "Cancel anytime in Google Play or the App Store.",
    proNote: "Subscriptions keep the free tier free for everyone.",
  },
  es: {
    import: "Importar", record: "Grabar", stop: "Detener", transcribing: "Transcribiendo…",
    emptyState: "Toca grabar para empezar a transcribir o importa un archivo de audio.",
    untitled: "Transcripción sin título", noText: "No se devolvió texto", speaker: "Interlocutor",
    tapToExpand: "Toca para ampliar...", menuSupport: "Soporte", menuPrivacy: "Privacidad",
    menuTerms: "Términos", freeMinutes: "Minutos gratis", thisMonth: "este mes",
  },
  pt: {
    import: "Importar", record: "Gravar", stop: "Parar", transcribing: "Transcrevendo…",
    emptyState: "Toque em gravar para começar a transcrever ou importe um arquivo de áudio.",
    untitled: "Transcrição sem título", noText: "Nenhum texto retornado", speaker: "Orador",
    tapToExpand: "Toque para expandir...", menuSupport: "Suporte", menuPrivacy: "Privacidade",
    menuTerms: "Termos", freeMinutes: "Minutos grátis", thisMonth: "este mês",
  },
  hi: {
    import: "आयात करें", record: "रिकॉर्ड करें", stop: "रोकें", transcribing: "ट्रांसक्राइब हो रहा है…",
    emptyState: "ट्रांसक्राइब करने के लिए रिकॉर्ड दबाएं या ऑडियो फ़ाइल आयात करें।",
    untitled: "बिना शीर्षक ट्रांसक्रिप्शन", noText: "कोई टेक्स्ट नहीं मिला", speaker: "वक्ता",
    tapToExpand: "विस्तार करने के लिए टैप करें...", menuSupport: "सहायता", menuPrivacy: "गोपनीयता",
    menuTerms: "नियम", freeMinutes: "मुफ्त मिनट", thisMonth: "इस महीने",
  },
  id: {
    import: "Impor", record: "Rekam", stop: "Berhenti", transcribing: "Mentranskripsikan…",
    emptyState: "Ketuk rekam untuk mulai mentranskripsikan, atau impor file audio.",
    untitled: "Transkrip tanpa judul", noText: "Tidak ada teks", speaker: "Pembicara",
    tapToExpand: "Ketuk untuk memperluas...", menuSupport: "Dukungan", menuPrivacy: "Privasi",
    menuTerms: "Ketentuan", freeMinutes: "Menit gratis", thisMonth: "bulan ini",
  },
  ms: {
    import: "Import", record: "Rakam", stop: "Henti", transcribing: "Mentranskripsi…",
    emptyState: "Ketuk rakam untuk mula mentranskripsi, atau import fail audio.",
    untitled: "Transkrip tanpa tajuk", noText: "Tiada teks", speaker: "Penceramah",
    tapToExpand: "Ketuk untuk kembangkan...", menuSupport: "Sokongan", menuPrivacy: "Privasi",
    menuTerms: "Terma", freeMinutes: "Minit percuma", thisMonth: "bulan ini",
  },
  th: {
    import: "นำเข้า", record: "บันทึก", stop: "หยุด", transcribing: "กำลังถอดเสียง…",
    emptyState: "แตะบันทึกเพื่อเริ่มถอดเสียง หรือนำเข้าไฟล์เสียง",
    untitled: "การถอดเสียงที่ไม่มีชื่อ", noText: "ไม่มีข้อความ", speaker: "ผู้พูด",
    tapToExpand: "แตะเพื่อขยาย...", menuSupport: "การสนับสนุน", menuPrivacy: "ความเป็นส่วนตัว",
    menuTerms: "ข้อกำหนด", freeMinutes: "นาทีฟรี", thisMonth: "เดือนนี้",
  },
  vi: {
    import: "Nhập", record: "Ghi âm", stop: "Dừng", transcribing: "Đang chuyển chữ…",
    emptyState: "Chạm ghi âm để bắt đầu phiên âm hoặc nhập tệp âm thanh.",
    untitled: "Bản phiên âm chưa đặt tên", noText: "Không có văn bản", speaker: "Người nói",
    tapToExpand: "Chạm để mở rộng...", menuSupport: "Hỗ trợ", menuPrivacy: "Quyền riêng tư",
    menuTerms: "Điều khoản", freeMinutes: "Phút miễn phí", thisMonth: "tháng này",
  },
  tl: {
    import: "Import", record: "Mag-record", stop: "Itigil", transcribing: "Nagta-transcribe…",
    emptyState: "I-tap ang record para magsimulang mag-transcribe, o mag-import ng audio file.",
    untitled: "Transkripsyon na walang pamagat", noText: "Walang tekstong ibinalik", speaker: "Nagsasalita",
    tapToExpand: "I-tap para palawakin...", menuSupport: "Suporta", menuPrivacy: "Privacy",
    menuTerms: "Terms", freeMinutes: "Libreng minuto", thisMonth: "ngayong buwan",
  },
  de: {
    import: "Importieren", record: "Aufnehmen", stop: "Stopp", transcribing: "Transkribiere…",
    emptyState: "Tippen Sie auf Aufnehmen, um mit der Transkription zu beginnen, oder importieren Sie eine Audiodatei.",
    untitled: "Unbenannte Transkription", noText: "Kein Text zurückgegeben", speaker: "Sprecher",
    tapToExpand: "Zum Erweitern tippen...", menuSupport: "Support", menuPrivacy: "Datenschutz",
    menuTerms: "Nutzungsbedingungen", freeMinutes: "Kostenlose Minuten", thisMonth: "diesen Monat",
  },
  fr: {
    import: "Importer", record: "Enregistrer", stop: "Arrêter", transcribing: "Transcription…",
    emptyState: "Touchez Enregistrer pour commencer la transcription ou importez un fichier audio.",
    untitled: "Transcription sans titre", noText: "Aucun texte retourné", speaker: "Intervenant",
    tapToExpand: "Touchez pour développer...", menuSupport: "Assistance", menuPrivacy: "Confidentialité",
    menuTerms: "Conditions", freeMinutes: "Minutes gratuites", thisMonth: "ce mois-ci",
  },
  it: {
    import: "Importa", record: "Registra", stop: "Ferma", transcribing: "Trascrizione…",
    emptyState: "Tocca Registra per iniziare la trascrizione o importa un file audio.",
    untitled: "Trascrizione senza titolo", noText: "Nessun testo restituito", speaker: "Relatore",
    tapToExpand: "Tocca per espandere...", menuSupport: "Supporto", menuPrivacy: "Privacy",
    menuTerms: "Termini", freeMinutes: "Minuti gratis", thisMonth: "questo mese",
  },
  nl: {
    import: "Importeren", record: "Opnemen", stop: "Stoppen", transcribing: "Transcriberen…",
    emptyState: "Tik op Opnemen om te beginnen met transcriberen of importeer een audiobestand.",
    untitled: "Transcript zonder titel", noText: "Geen tekst geretourneerd", speaker: "Spreker",
    tapToExpand: "Tik om uit te vouwen...", menuSupport: "Ondersteuning", menuPrivacy: "Privacy",
    menuTerms: "Voorwaarden", freeMinutes: "Gratis minuten", thisMonth: "deze maand",
  },
  pl: {
    import: "Importuj", record: "Nagraj", stop: "Zatrzymaj", transcribing: "Transkrybuję…",
    emptyState: "Dotknij Nagraj, aby rozpocząć transkrypcję, lub zaimportuj plik audio.",
    untitled: "Transkrypcja bez tytułu", noText: "Brak zwróconego tekstu", speaker: "Mówca",
    tapToExpand: "Dotknij, aby rozwinąć...", menuSupport: "Wsparcie", menuPrivacy: "Prywatność",
    menuTerms: "Warunki", freeMinutes: "Darmowe minuty", thisMonth: "w tym miesiącu",
  },
  sv: {
    import: "Importera", record: "Spela in", stop: "Stoppa", transcribing: "Transkriberar…",
    emptyState: "Tryck på Spela in för att börja transkribera eller importera en ljudfil.",
    untitled: "Transkription utan titel", noText: "Ingen text returnerad", speaker: "Talare",
    tapToExpand: "Tryck för att expandera...", menuSupport: "Support", menuPrivacy: "Integritet",
    menuTerms: "Villkor", freeMinutes: "Gratis minuter", thisMonth: "den här månaden",
  },
  no: {
    import: "Importer", record: "Ta opp", stop: "Stopp", transcribing: "Transkriberer…",
    emptyState: "Trykk på Ta opp for å starte transkribering eller importer en lydfil.",
    untitled: "Transkripsjon uten tittel", noText: "Ingen tekst returnert", speaker: "Taler",
    tapToExpand: "Trykk for å utvide...", menuSupport: "Støtte", menuPrivacy: "Personvern",
    menuTerms: "Vilkår", freeMinutes: "Gratis minutter", thisMonth: "denne måneden",
  },
  da: {
    import: "Importer", record: "Optag", stop: "Stop", transcribing: "Transskriberer…",
    emptyState: "Tryk på Optag for at starte transskribering eller importér en lydfil.",
    untitled: "Transskription uden titel", noText: "Ingen tekst returneret", speaker: "Taler",
    tapToExpand: "Tryk for at udvide...", menuSupport: "Support", menuPrivacy: "Privatliv",
    menuTerms: "Vilkår", freeMinutes: "Gratis minutter", thisMonth: "denne måned",
  },
  fi: {
    import: "Tuo", record: "Nauhoita", stop: "Lopeta", transcribing: "Kirjoitetaan puhtaaksi…",
    emptyState: "Aloita puhtaaksikirjoitus napauttamalla Nauhoita tai tuo äänitiedosto.",
    untitled: "Nimetön kirjoitus", noText: "Ei palautettua tekstiä", speaker: "Puhuja",
    tapToExpand: "Laajenna napauttamalla...", menuSupport: "Tuki", menuPrivacy: "Tietosuoja",
    menuTerms: "Ehdot", freeMinutes: "Ilmaiset minuutit", thisMonth: "tässä kuussa",
  },
  cs: {
    import: "Importovat", record: "Nahrát", stop: "Zastavit", transcribing: "Přepis…",
    emptyState: "Klepnutím na Nahrát zahájíte přepis nebo importujte zvukový soubor.",
    untitled: "Přepis bez názvu", noText: "Žádný vrácený text", speaker: "Mluvčí",
    tapToExpand: "Klepnutím rozbalíte...", menuSupport: "Podpora", menuPrivacy: "Soukromí",
    menuTerms: "Podmínky", freeMinutes: "Volné minuty", thisMonth: "tento měsíc",
  },
  el: {
    import: "Εισαγωγή", record: "Εγγραφή", stop: "Διακοπή", transcribing: "Μεταγραφή…",
    emptyState: "Πατήστε Εγγραφή για να ξεκινήσετε τη μεταγραφή ή εισαγάγετε ένα αρχείο ήχου.",
    untitled: "Μεταγραφή χωρίς τίτλο", noText: "Δεν επιστράφηκε κείμενο", speaker: "Ομιλητής",
    tapToExpand: "Πατήστε για επέκταση...", menuSupport: "Υποστήριξη", menuPrivacy: "Απόρρητο",
    menuTerms: "Όροι", freeMinutes: "Δωρεάν λεπτά", thisMonth: "αυτόν τον μήνα",
  },
  ro: {
    import: "Importă", record: "Înregistrează", stop: "Oprește", transcribing: "Transcriere…",
    emptyState: "Atingeți Înregistrare pentru a începe transcrierea sau importați un fișier audio.",
    untitled: "Transcriere fără titlu", noText: "Niciun text returnat", speaker: "Vorbitor",
    tapToExpand: "Atingeți pentru a extinde...", menuSupport: "Asistență", menuPrivacy: "Confidențialitate",
    menuTerms: "Termeni", freeMinutes: "Minute gratuite", thisMonth: "luna aceasta",
  },
  hu: {
    import: "Importálás", record: "Felvétel", stop: "Leállítás", transcribing: "Átírás…",
    emptyState: "Az átíráshoz érintse meg a Felvételt, vagy importáljon hangfájlt.",
    untitled: "Cím nélküli átirat", noText: "Nincs visszaadott szöveg", speaker: "Beszélő",
    tapToExpand: "Érintse meg a kibontáshoz...", menuSupport: "Támogatás", menuPrivacy: "Adatvédelem",
    menuTerms: "Feltételek", freeMinutes: "Ingyenes percek", thisMonth: "ebben a hónapban",
  },
  uk: {
    import: "Імпорт", record: "Запис", stop: "Стоп", transcribing: "Транскрибуємо…",
    emptyState: "Натисніть «Запис», щоб почати транскрибування, або імпортуйте аудіофайл.",
    untitled: "Транскрипт без назви", noText: "Немає тексту", speaker: "Говорящий",
    tapToExpand: "Натисніть, щоб розгорнути...", menuSupport: "Підтримка", menuPrivacy: "Конфіденційність",
    menuTerms: "Умови", freeMinutes: "Безкоштовні хвилини", thisMonth: "цього місяця",
  },
  ru: {
    import: "Импорт", record: "Запись", stop: "Стоп", transcribing: "Транскрибируем…",
    emptyState: "Нажмите «Запись», чтобы начать транскрибацию, или импортируйте аудиофайл.",
    untitled: "Транскрипт без названия", noText: "Нет текста", speaker: "Говорящий",
    tapToExpand: "Нажмите, чтобы развернуть...", menuSupport: "Поддержка", menuPrivacy: "Конфиденциальность",
    menuTerms: "Условия", freeMinutes: "Бесплатные минуты", thisMonth: "в этом месяце",
  },
  ar: {
    import: "استيراد", record: "تسجيل", stop: "إيقاف", transcribing: "جارٍ التفريغ…",
    emptyState: "اضغط على تسجيل لبدء التفريغ أو استيراد ملف صوتي.",
    untitled: "تفريغ بدون عنوان", noText: "لا يوجد نص", speaker: "المتحدث",
    tapToExpand: "اضغط للتوسيع...", menuSupport: "الدعم", menuPrivacy: "الخصوصية",
    menuTerms: "الشروط", freeMinutes: "دقائق مجانية", thisMonth: "هذا الشهر",
  },
  bn: {
    import: "আমদানি", record: "রেকর্ড", stop: "বন্ধ", transcribing: "ট্রান্সক্রিপশন হচ্ছে…",
    emptyState: "ট্রান্সক্রিপশন শুরু করতে রেকর্ড চাপুন বা একটি অডিও ফাইল আমদানি করুন।",
    untitled: "শিরোনামহীন ট্রান্সক্রিপ্ট", noText: "কোন পাঠ্য নেই", speaker: "বক্তা",
    tapToExpand: "বিস্তার করতে ট্যাপ করুন...", menuSupport: "সহায়তা", menuPrivacy: "গোপনীয়তা",
    menuTerms: "শর্তাবলী", freeMinutes: "ফ্রি মিনিট", thisMonth: "এই মাসে",
  },
  ur: {
    import: "درآمد", record: "ریکارڈ", stop: "روکیں", transcribing: "نقل کر رہا ہے…",
    emptyState: "نقل شروع کرنے کے لیے ریکارڈ دبائیں یا آڈیو فائل درآمد کریں۔",
    untitled: "بلا عنوان نقلی", noText: "کوئی متن نہیں", speaker: "مقرر",
    tapToExpand: "پھیلانے کے لیے تھپتھپائیں...", menuSupport: "سپورٹ", menuPrivacy: "رازداری",
    menuTerms: "شرائط", freeMinutes: "مفت منٹ", thisMonth: "اس ماہ",
  },
  mr: {
    import: "आयात करा", record: "रेकॉर्ड करा", stop: "थांबवा", transcribing: "लिप्यंतर होत आहे…",
    emptyState: "लिप्यंतरण सुरू करण्यासाठी रेकॉर्ड करा किंवा ऑडिओ फाइल आयात करा.",
    untitled: "शीर्षक नसलेला उतारा", noText: "मजकूर नाही", speaker: "वक्ता",
    tapToExpand: "विस्तारण्यासाठी टॅप करा...", menuSupport: "मदत", menuPrivacy: "गोपनीयता",
    menuTerms: "अटी", freeMinutes: "विनामूल्य मिनिटे", thisMonth: "या महिन्यात",
  },
  te: {
    import: "దిగుమతి", record: "రికార్డ్", stop: "ఆపు", transcribing: "ట్రాన్స్క్రైబ్ అవుతోంది…",
    emptyState: "ట్రాన్స్క్రైబ్ ప్రారంభించడానికి రికార్డ్ నొక్కండి లేదా ఆడియో ఫైల్ దిగుమతి చేయండి.",
    untitled: "శీర్షిక లేని ట్రాన్స్క్రిప్ట్", noText: "టెక్స్ట్ లేదు", speaker: "మాట్లాడే వ్యక్తి",
    tapToExpand: "విస్తరించడానికి నొక్కండి...", menuSupport: "మద్దతు", menuPrivacy: "గోప్యత",
    menuTerms: "నిబంధనలు", freeMinutes: "ఉచిత నిమిషాలు", thisMonth: "ఈ నెలలో",
  },
  ta: {
    import: "இறக்குமதி", record: "பதிவு", stop: "நிறுத்து", transcribing: "பிரதி எடுக்கப்படுகிறது…",
    emptyState: "பிரதி எடுக்க பதிவு தட்டவும் அல்லது ஆடியோ கோப்பை இறக்குமதி செய்யவும்.",
    untitled: "தலைப்பு இல்லாத பிரதி", noText: "உரை இல்லை", speaker: "பேச்சாளர்",
    tapToExpand: "விரிவாக்க தட்டவும்...", menuSupport: "ஆதரவு", menuPrivacy: "தனியுரிமை",
    menuTerms: "விதிமுறைகள்", freeMinutes: "இலவச நிமிடங்கள்", thisMonth: "இந்த மாதம்",
  },
  fa: {
    import: "واردات", record: "ضبط", stop: "توقف", transcribing: "در حال رونویسی…",
    emptyState: "برای شروع رونویسی روی ضبط ضربه بزنید یا فایل صوتی وارد کنید.",
    untitled: "رونوشت بدون عنوان", noText: "متنی برگردانده نشد", speaker: "گوینده",
    tapToExpand: "برای گسترش ضربه بزنید...", menuSupport: "پشتیبانی", menuPrivacy: "حریم خصوصی",
    menuTerms: "شرایط", freeMinutes: "دقیقه رایگان", thisMonth: "این ماه",
  },
  tr: {
    import: "İçe Aktar", record: "Kaydet", stop: "Durdur", transcribing: "Yazıya dökülüyor…",
    emptyState: "Yazıya dökmek için Kaydet'e dokunun veya bir ses dosyası içe aktarın.",
    untitled: "Başlıksız döküm", noText: "Metin döndürülmedi", speaker: "Konuşmacı",
    tapToExpand: "Genişletmek için dokunun...", menuSupport: "Destek", menuPrivacy: "Gizlilik",
    menuTerms: "Şartlar", freeMinutes: "Ücretsiz dakika", thisMonth: "bu ay",
  },
  ko: {
    import: "가져오기", record: "녹음", stop: "중지", transcribing: "받아쓰는 중…",
    emptyState: "녹음을 눌러 받아쓰기를 시작하거나 오디오 파일을 가져오세요.",
    untitled: "제목 없는 대본", noText: "텍스트가 없음", speaker: "화자",
    tapToExpand: "펼치려면 탭하세요...", menuSupport: "지원", menuPrivacy: "개인정보",
    menuTerms: "약관", freeMinutes: "무료 분", thisMonth: "이번 달",
  },
  ja: {
    import: "インポート", record: "録音", stop: "停止", transcribing: "書き起こし中…",
    emptyState: "録音をタップして書き起こしを開始するか、オーディオファイルをインポートしてください。",
    untitled: "無題の書き起こし", noText: "テキストがありません", speaker: "話者",
    tapToExpand: "タップして展開...", menuSupport: "サポート", menuPrivacy: "プライバシー",
    menuTerms: "利用規約", freeMinutes: "無料分", thisMonth: "今月",
  },
  zh: {
    import: "导入", record: "录音", stop: "停止", transcribing: "转录中…",
    emptyState: "点击录音开始转录，或导入音频文件。",
    untitled: "未命名转录", noText: "无文本返回", speaker: "说话人",
    tapToExpand: "点击展开...", menuSupport: "支持", menuPrivacy: "隐私",
    menuTerms: "条款", freeMinutes: "免费分钟", thisMonth: "本月",
  },
  ha: {
    import: "Shigo da", record: "Yi rikodin", stop: "Tsaya", transcribing: "Ana fassara…",
    emptyState: "Danna rikodin don fara fassara ko shigo da fayil mai jiwowar sauti.",
    untitled: "Fassara ba tare da suna ba", noText: "Babu rubutu", speaker: "Mai magana",
    tapToExpand: "Danna don faɗaɗa...", menuSupport: "Tallafi", menuPrivacy: "Sirri",
    menuTerms: "Sharuɗɗa", freeMinutes: "Mintoci kyauta", thisMonth: "wannan watan",
  },
};

export const DEFAULT_LANG: Lang = "en";
const LANG_KEY = "freesurf-app-lang";

/** Return the language code if we have a translation for it, otherwise English. */
export function normalizeLang(code?: string | null): Lang {
  if (code && translations[code]) return code;
  return DEFAULT_LANG;
}

export function deviceLang(): Lang {
  try {
    return normalizeLang(getLocales()?.[0]?.languageCode);
  } catch {
    return DEFAULT_LANG;
  }
}

export function translationsFor(lang: Lang): Strings {
  const en = translations[DEFAULT_LANG] ?? {};
  return { ...en, ...(translations[lang] ?? {}) };
}

/**
 * Returns the active language (device locale by default) plus a persisted override.
 * `chosen` is true only once the user has explicitly picked a language (so the first-launch
 * chooser shows until then). The stored value is the raw code (e.g. "hi"); the UI falls back to
 * English for languages we haven't translated yet.
 */
export function useAppLanguage(): {
  lang: Lang;
  loaded: boolean;
  chosen: boolean;
  chosenCode: string | null;
  setLanguage: (code: string) => void;
} {
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((v) => {
        if (v) setChosenCode(v);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);
  const lang = normalizeLang(chosenCode ?? deviceLang());
  const setLanguage = (code: string) => {
    setChosenCode(code);
    AsyncStorage.setItem(LANG_KEY, code).catch(() => {});
  };
  return { lang, loaded, chosen: loaded && chosenCode !== null, chosenCode, setLanguage };
}
