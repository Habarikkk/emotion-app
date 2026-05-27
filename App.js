import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";

const STORAGE_KEY = "emotion-check-ins-v2";
const LEGACY_STORAGE_KEY = "emotion-check-ins-v1";
const SETTINGS_KEY = "emotion-check-in-settings-v2";
const LEGACY_SETTINGS_KEY = "emotion-check-in-settings-v1";
const GOALS_KEY = "emotion-check-in-goals-v1";
const GOAL_COUNT = 100;

const EMOTION_SUGGESTIONS = [
  "тревога",
  "раздражение",
  "злость",
  "стыд",
  "грусть",
  "радость",
  "интерес",
  "облегчение",
  "напряжение",
  "спокойствие",
];

const TAG_OPTIONS = [
  "сон",
  "работа",
  "отношения",
  "здоровье",
  "деньги",
  "терапия",
  "конфликт",
  "одиночество",
  "перегруз",
  "тело",
];

const GOAL_CATEGORIES = [
  "здоровье",
  "отношения",
  "работа",
  "творчество",
  "деньги",
  "дом",
  "обучение",
  "опыт",
];

const DEFAULT_SETTINGS = {
  hour: 21,
  minute: 0,
  enabled: false,
  supportContact: "",
  supportPlan: "",
  themeMode: "system",
  accent: "plum",
};

const ACCENTS = {
  plum: {
    name: "Слива",
    main: "#7c3aed",
    strong: "#5b21b6",
    softLight: "#efe7ff",
    softDark: "#2d1b4d",
    onAccent: "#ffffff",
  },
  indigo: {
    name: "Индиго",
    main: "#4f46e5",
    strong: "#3730a3",
    softLight: "#e8eaff",
    softDark: "#20245f",
    onAccent: "#ffffff",
  },
  coral: {
    name: "Коралл",
    main: "#e45757",
    strong: "#b91c1c",
    softLight: "#ffe7e1",
    softDark: "#4f2020",
    onAccent: "#ffffff",
  },
  moss: {
    name: "Мох",
    main: "#3d8b6d",
    strong: "#166344",
    softLight: "#ddf4e8",
    softDark: "#173d2e",
    onAccent: "#ffffff",
  },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromDayKey(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function makeEmotionDraft(patch = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    trigger: "",
    intensity: 5,
    ...patch,
  };
}

function makeEmptyGoal(index) {
  return {
    id: `goal-${index + 1}`,
    index,
    title: "",
    why: "",
    nextStep: "",
    category: "",
    done: false,
    updatedAt: null,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function isGoalStarted(goal) {
  return Boolean(
    goal?.title?.trim() ||
      goal?.why?.trim() ||
      goal?.nextStep?.trim() ||
      goal?.category ||
      goal?.done
  );
}

function normalizeGoal(goal, index) {
  return {
    ...makeEmptyGoal(index),
    ...(goal ?? {}),
    id: goal?.id ?? `goal-${index + 1}`,
    index,
    title: goal?.title ?? "",
    why: goal?.why ?? "",
    nextStep: goal?.nextStep ?? "",
    category: goal?.category ?? "",
    done: Boolean(goal?.done),
    updatedAt: goal?.updatedAt ?? null,
  };
}

function normalizeGoals(raw) {
  let parsed = [];
  if (raw) {
    const data = JSON.parse(raw);
    parsed = Array.isArray(data) ? data : Object.values(data);
  }

  return Array.from({ length: GOAL_COUNT }, (_, index) => normalizeGoal(parsed[index], index));
}

function normalizeEmotion(emotion) {
  return {
    id: emotion?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: emotion?.name ?? "",
    trigger: emotion?.trigger ?? "",
    intensity: Number(emotion?.intensity ?? 5),
  };
}

function normalizeEntry(entry) {
  return {
    id: entry?.id ?? `${entry?.dateKey ?? localDayKey()}-${Date.now()}`,
    dateKey: entry?.dateKey ?? localDayKey(),
    savedAt: entry?.savedAt ?? new Date().toISOString(),
    mood: Number(entry?.mood ?? 0),
    energy: Number(entry?.energy ?? 5),
    sleepHours: Number(entry?.sleepHours ?? 7.5),
    notes: entry?.notes ?? "",
    emotions: Array.isArray(entry?.emotions) ? entry.emotions.map(normalizeEmotion) : [],
    triggerTags: Array.isArray(entry?.triggerTags) ? entry.triggerTags : [],
    medsTaken: Boolean(entry?.medsTaken),
    alcoholUsed: Boolean(entry?.alcoholUsed),
    caffeineLate: Boolean(entry?.caffeineLate),
    planTomorrow: entry?.planTomorrow ?? "",
  };
}

function normalizeEntriesByDay(raw) {
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);

  return entries.reduce((acc, entry) => {
    const normalized = normalizeEntry(entry);
    acc[normalized.dateKey] = normalized;
    return acc;
  }, {});
}

function createCSV(entries) {
  const rows = [
    [
      "date",
      "mood",
      "energy",
      "sleepHours",
      "medsTaken",
      "alcoholUsed",
      "caffeineLate",
      "tags",
      "emotion",
      "trigger",
      "intensity",
      "planTomorrow",
      "notes",
    ].join(","),
  ];

  entries.forEach((entry) => {
    const emotions = entry.emotions.length ? entry.emotions : [makeEmotionDraft()];
    emotions.forEach((emotion) => {
      rows.push(
        [
          csvCell(entry.dateKey),
          csvCell(entry.mood),
          csvCell(entry.energy),
          csvCell(entry.sleepHours),
          csvCell(entry.medsTaken ? "yes" : "no"),
          csvCell(entry.alcoholUsed ? "yes" : "no"),
          csvCell(entry.caffeineLate ? "yes" : "no"),
          csvCell(entry.triggerTags.join("; ")),
          csvCell(emotion.name),
          csvCell(emotion.trigger),
          csvCell(emotion.intensity),
          csvCell(entry.planTomorrow),
          csvCell(entry.notes),
        ].join(",")
      );
    });
  });

  return rows.join("\n");
}

function createGoalsText(goals) {
  const filled = goals.filter(isGoalStarted);
  if (!filled.length) {
    return "100 целей\n\nПока нет заполненных целей.";
  }

  return [
    "100 целей",
    "",
    ...filled.map((goal) => {
      const lines = [
        `${goal.index + 1}. ${goal.done ? "[x]" : "[ ]"} ${goal.title || "Без названия"}`,
      ];
      if (goal.category) {
        lines.push(`   Категория: ${goal.category}`);
      }
      if (goal.why) {
        lines.push(`   Зачем: ${goal.why}`);
      }
      if (goal.nextStep) {
        lines.push(`   Следующий шаг: ${goal.nextStep}`);
      }
      return lines.join("\n");
    }),
  ].join("\n");
}

function average(values, fallback = 0) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return fallback;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function topCounts(values, limit = 3) {
  const counts = values.reduce((acc, value) => {
    const key = String(value ?? "").trim().toLowerCase();
    if (!key) {
      return acc;
    }
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function buildInsights(entries) {
  const week = entries.slice(0, 7);
  const avgMood = average(week.map((entry) => entry.mood));
  const avgEnergy = average(week.map((entry) => entry.energy));
  const avgSleep = average(week.map((entry) => entry.sleepHours));
  const lowSleepDays = week.filter((entry) => entry.sleepHours < 6).length;
  const elevatedDays = week.filter((entry) => entry.energy >= 8 || entry.mood >= 4).length;
  const lowMoodDays = week.filter((entry) => entry.mood <= -3).length;
  const highIntensityDays = week.filter((entry) =>
    entry.emotions.some((emotion) => emotion.intensity >= 8)
  ).length;
  const topEmotions = topCounts(week.flatMap((entry) => entry.emotions.map((emotion) => emotion.name)));
  const topTags = topCounts(week.flatMap((entry) => entry.triggerTags));

  const flags = [];
  if (week.length < 3) {
    flags.push("Пока мало данных. После 3-7 записей обзор станет полезнее.");
  }
  if (lowSleepDays >= 2) {
    flags.push(`${lowSleepDays} дня с коротким сном. Это стоит отметить для врача или терапевта.`);
  }
  if (elevatedDays >= 2) {
    flags.push(`${elevatedDays} дня с высокой энергией или настроением. Посмотри, совпало ли это со сном.`);
  }
  if (lowMoodDays >= 2) {
    flags.push(`${lowMoodDays} дня с низким настроением. Хорошая тема для ближайшей сессии.`);
  }
  if (highIntensityDays >= 3) {
    flags.push("Несколько дней с эмоциями высокой интенсивности. Возможно, были повторяющиеся триггеры.");
  }

  return {
    week,
    avgMood,
    avgEnergy,
    avgSleep,
    lowSleepDays,
    elevatedDays,
    lowMoodDays,
    highIntensityDays,
    topEmotions,
    topTags,
    flags,
  };
}

function buildTherapySummary(entries, insights) {
  const week = insights.week;
  if (!week.length) {
    return "За эту неделю пока нет записей.";
  }

  const lines = [
    "Недельная сводка для терапии",
    "",
    `Записей: ${week.length}`,
    `Среднее настроение: ${insights.avgMood.toFixed(1)} из диапазона -5...5`,
    `Средняя энергия: ${insights.avgEnergy.toFixed(1)}/10`,
    `Средний сон: ${insights.avgSleep.toFixed(1)} ч`,
    "",
    `Частые эмоции: ${insights.topEmotions.map((item) => `${item.label} (${item.count})`).join(", ") || "нет данных"}`,
    `Частые теги: ${insights.topTags.map((item) => `${item.label} (${item.count})`).join(", ") || "нет данных"}`,
    "",
    "Поводы обсудить:",
    ...(insights.flags.length ? insights.flags.map((flag) => `- ${flag}`) : ["- Явных повторяющихся сигналов пока нет."]),
    "",
    "Последние записи:",
    ...week.map((entry) => {
      const emotions = entry.emotions.map((emotion) => `${emotion.name} ${emotion.intensity}/10`).join("; ");
      const factors = [
        entry.medsTaken ? "препараты: да" : "препараты: не отмечено",
        entry.alcoholUsed ? "алкоголь: да" : "алкоголь: нет",
        entry.caffeineLate ? "поздний кофеин: да" : "поздний кофеин: нет",
      ].join(", ");
      return `- ${entry.dateKey}: настроение ${entry.mood}, энергия ${entry.energy}/10, сон ${entry.sleepHours} ч; ${factors}; эмоции: ${emotions}`;
    }),
  ];

  return lines.join("\n");
}

function calculateStreak(entriesByDay) {
  let streak = 0;
  const cursor = new Date();

  while (entriesByDay[localDayKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function makePalette(themeMode, systemScheme, accentKey) {
  const dark = themeMode === "dark" || (themeMode === "system" && systemScheme === "dark");
  const accent = ACCENTS[accentKey] ?? ACCENTS.plum;

  if (dark) {
    return {
      dark,
      accentKey,
      background: "#090b12",
      backgroundAlt: "#111424",
      surface: "rgba(27, 31, 48, 0.82)",
      surfaceStrong: "#1b1f30",
      surfaceMuted: "rgba(39, 45, 67, 0.82)",
      cardBorder: "rgba(255,255,255,0.10)",
      border: "#32394f",
      text: "#f5f7fb",
      muted: "#aab3c5",
      subtle: "#7d879a",
      placeholder: "#7d879a",
      accent: accent.main,
      accentStrong: accent.strong,
      accentSoft: accent.softDark,
      accentText: accent.onAccent,
      secondaryAccent: "#f2a65a",
      secondarySoft: "#3c2b18",
      danger: "#ff7a7a",
      dangerSoft: "#402225",
      warningText: "#f2b86b",
      tab: "rgba(17,20,32,0.94)",
      shadow: "#000000",
      metricViolet: "#2c2148",
      metricTeal: "#173d3a",
      metricGold: "#3f3017",
      metricText: "#f5f7fb",
      safetyBg: "#2c2618",
      safetyBorder: "#6e5421",
      safetyText: "#f1d29c",
    };
  }

  return {
    dark,
    accentKey,
    background: "#f5f3ff",
    backgroundAlt: "#f8fafc",
    surface: "rgba(255,255,255,0.78)",
    surfaceStrong: "#ffffff",
    surfaceMuted: "rgba(248,250,252,0.92)",
    cardBorder: "rgba(255,255,255,0.92)",
    border: "#dfe5ef",
    text: "#151827",
    muted: "#5f6878",
    subtle: "#7c8494",
    placeholder: "#7c8494",
    accent: accent.main,
    accentStrong: accent.strong,
    accentSoft: accent.softLight,
    accentText: accent.onAccent,
    secondaryAccent: "#d8862f",
    secondarySoft: "#fff1d8",
    danger: "#b42318",
    dangerSoft: "#ffe7e1",
    warningText: "#a15816",
    tab: "rgba(255,255,255,0.92)",
    shadow: "#50546a",
    metricViolet: "#efe7ff",
    metricTeal: "#e2f5ef",
    metricGold: "#fff1d8",
    metricText: "#151827",
    safetyBg: "#fff8eb",
    safetyBorder: "#efd9ad",
    safetyText: "#735a27",
  };
}

async function writeAndShareFile(filename, content, mimeType) {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: "Экспорт дневника",
    });
  } else {
    await Share.share({ message: content });
  }
}

async function scheduleDailyReminder(hour, minute) {
  const permission = await Notifications.requestPermissionsAsync();

  if (permission.status !== "granted") {
    Alert.alert(
      "Уведомления выключены",
      "Разреши уведомления в настройках iOS, чтобы получать вечерний вопрос."
    );
    return false;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Вечерняя проверка",
      body: "Запиши эмоции, сон, энергию и один план на завтра.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  return true;
}

export default function App() {
  const systemScheme = useColorScheme();
  const todayKey = localDayKey();
  const [tab, setTab] = useState("today");
  const [entriesByDay, setEntriesByDay] = useState({});
  const [goals, setGoals] = useState(() => normalizeGoals(null));
  const [goalView, setGoalView] = useState("all");
  const [expandedGoals, setExpandedGoals] = useState({});
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [mood, setMood] = useState(0);
  const [energy, setEnergy] = useState(5);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [notes, setNotes] = useState("");
  const [emotions, setEmotions] = useState([makeEmotionDraft(), makeEmotionDraft()]);
  const [triggerTags, setTriggerTags] = useState([]);
  const [medsTaken, setMedsTaken] = useState(false);
  const [alcoholUsed, setAlcoholUsed] = useState(false);
  const [caffeineLate, setCaffeineLate] = useState(false);
  const [planTomorrow, setPlanTomorrow] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const palette = useMemo(
    () => makePalette(settings.themeMode, systemScheme, settings.accent),
    [settings.accent, settings.themeMode, systemScheme]
  );
  const styles = useMemo(() => createStyles(palette), [palette]);

  const sortedEntries = useMemo(() => {
    return Object.values(entriesByDay).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [entriesByDay]);

  const insights = useMemo(() => buildInsights(sortedEntries), [sortedEntries]);
  const streak = useMemo(() => calculateStreak(entriesByDay), [entriesByDay]);
  const filledGoals = useMemo(() => goals.filter(isGoalStarted), [goals]);
  const doneGoals = useMemo(() => filledGoals.filter((goal) => goal.done), [filledGoals]);
  const activeGoals = useMemo(() => filledGoals.filter((goal) => !goal.done), [filledGoals]);
  const nextEmptyGoal = useMemo(() => goals.find((goal) => !isGoalStarted(goal)), [goals]);
  const focusGoal = useMemo(
    () => activeGoals.find((goal) => goal.nextStep.trim()) ?? activeGoals[0] ?? nextEmptyGoal,
    [activeGoals, nextEmptyGoal]
  );
  const visibleGoals = useMemo(() => {
    if (goalView === "active") {
      return [...activeGoals, ...(nextEmptyGoal ? [nextEmptyGoal] : [])];
    }
    if (goalView === "done") {
      return doneGoals;
    }
    return goals;
  }, [activeGoals, doneGoals, goalView, goals, nextEmptyGoal]);

  const completeEmotionCount = emotions.filter(
    (emotion) => emotion.name.trim() && emotion.trigger.trim()
  ).length;

  const todaySignals = useMemo(() => {
    const signals = [];
    if (sleepHours < 6) {
      signals.push("короткий сон");
    }
    if (energy >= 8) {
      signals.push("высокая энергия");
    }
    if (mood >= 4) {
      signals.push("очень высокое настроение");
    }
    if (mood <= -3) {
      signals.push("низкое настроение");
    }
    if (caffeineLate) {
      signals.push("поздний кофеин");
    }
    if (alcoholUsed) {
      signals.push("алкоголь");
    }
    return signals;
  }, [alcoholUsed, caffeineLate, energy, mood, sleepHours]);

  useEffect(() => {
    loadInitialState();
  }, []);

  useEffect(() => {
    const todayEntry = entriesByDay[todayKey];

    if (!todayEntry) {
      return;
    }

    setMood(todayEntry.mood);
    setEnergy(todayEntry.energy);
    setSleepHours(todayEntry.sleepHours);
    setNotes(todayEntry.notes);
    setTriggerTags(todayEntry.triggerTags);
    setMedsTaken(todayEntry.medsTaken);
    setAlcoholUsed(todayEntry.alcoholUsed);
    setCaffeineLate(todayEntry.caffeineLate);
    setPlanTomorrow(todayEntry.planTomorrow);
    setEmotions(
      todayEntry.emotions.length >= 2
        ? todayEntry.emotions
        : [...todayEntry.emotions, makeEmotionDraft()]
    );
  }, [entriesByDay, todayKey]);

  async function loadInitialState() {
    try {
      const [rawEntries, rawLegacyEntries, rawSettings, rawLegacySettings, rawGoals] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(LEGACY_STORAGE_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(LEGACY_SETTINGS_KEY),
        AsyncStorage.getItem(GOALS_KEY),
      ]);

      const normalizedEntries = normalizeEntriesByDay(rawEntries ?? rawLegacyEntries);
      setEntriesByDay(normalizedEntries);

      if (!rawEntries && rawLegacyEntries) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedEntries));
      }

      const parsedSettings = rawSettings ?? rawLegacySettings;
      if (parsedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(parsedSettings) });
      }

      const normalizedGoals = normalizeGoals(rawGoals);
      setGoals(normalizedGoals);
      if (!rawGoals) {
        await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(normalizedGoals));
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить сохраненные данные.");
    }
  }

  async function persistEntries(nextEntries) {
    setEntriesByDay(nextEntries);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  }

  async function persistSettings(nextSettings) {
    setSettings(nextSettings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
  }

  async function persistGoals(nextGoals) {
    setGoals(nextGoals);
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(nextGoals));
  }

  function updateEmotion(id, patch) {
    setEmotions((current) =>
      current.map((emotion) => (emotion.id === id ? { ...emotion, ...patch } : emotion))
    );
  }

  function addEmotionSuggestion(name) {
    const firstEmpty = emotions.find((emotion) => !emotion.name.trim());
    if (firstEmpty) {
      updateEmotion(firstEmpty.id, { name });
      return;
    }
    setEmotions([...emotions, makeEmotionDraft({ name })]);
  }

  function removeEmotion(id) {
    if (emotions.length <= 2) {
      return;
    }

    setEmotions((current) => current.filter((emotion) => emotion.id !== id));
  }

  function toggleTag(tag) {
    setTriggerTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    );
  }

  function updateGoal(index, patch) {
    const nextGoals = goals.map((goal) =>
      goal.index === index ? normalizeGoal({ ...goal, ...patch, updatedAt: new Date().toISOString() }, index) : goal
    );
    persistGoals(nextGoals);
  }

  function toggleGoalExpanded(goalId) {
    setExpandedGoals((current) => ({ ...current, [goalId]: !current[goalId] }));
  }

  function clearGoal(goal) {
    Alert.alert("Очистить цель?", `Слот ${goal.index + 1} будет пустым.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Очистить",
        style: "destructive",
        onPress: () => updateGoal(goal.index, makeEmptyGoal(goal.index)),
      },
    ]);
  }

  async function saveToday() {
    const completedEmotions = emotions
      .map((emotion) => ({
        ...emotion,
        name: emotion.name.trim(),
        trigger: emotion.trigger.trim(),
      }))
      .filter((emotion) => emotion.name && emotion.trigger);

    if (completedEmotions.length < 2) {
      Alert.alert("Нужно минимум 2 эмоции", "Заполни название и причину для каждой эмоции.");
      return;
    }

    const nextEntry = normalizeEntry({
      id: entriesByDay[todayKey]?.id ?? `${todayKey}-${Date.now()}`,
      dateKey: todayKey,
      savedAt: new Date().toISOString(),
      mood,
      energy,
      sleepHours,
      notes: notes.trim(),
      emotions: completedEmotions,
      triggerTags,
      medsTaken,
      alcoholUsed,
      caffeineLate,
      planTomorrow: planTomorrow.trim(),
    });

    await persistEntries({ ...entriesByDay, [todayKey]: nextEntry });
    Alert.alert("Сохранено", "Запись сохранена локально на телефоне.");
  }

  async function exportJSON() {
    await writeAndShareFile(
      "emotion-check-ins.json",
      JSON.stringify(sortedEntries, null, 2),
      "application/json"
    );
  }

  async function exportCSV() {
    await writeAndShareFile("emotion-check-ins.csv", createCSV(sortedEntries), "text/csv");
  }

  async function exportSummary() {
    await writeAndShareFile(
      "therapy-week-summary.txt",
      buildTherapySummary(sortedEntries, insights),
      "text/plain"
    );
  }

  async function exportGoals() {
    await writeAndShareFile("hundred-goals.txt", createGoalsText(goals), "text/plain");
  }

  async function enableReminder() {
    const enabled = await scheduleDailyReminder(settings.hour, settings.minute);
    const nextSettings = { ...settings, enabled };
    await persistSettings(nextSettings);

    if (enabled) {
      Alert.alert(
        "Напоминание включено",
        `Каждый день в ${String(settings.hour).padStart(2, "0")}:${String(settings.minute).padStart(2, "0")}.`
      );
    }
  }

  async function disableReminder() {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await persistSettings({ ...settings, enabled: false });
    Alert.alert("Напоминание выключено");
  }

  function renderToday() {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header
          styles={styles}
          eyebrow={streak > 0 ? `серия ${streak} дн.` : "новая запись"}
          title="Сегодня"
          subtitle={`${todayKey} · вечерняя проверка`}
        />

        <View style={styles.heroCard}>
          <MetricTile styles={styles} label="Настроение" value={mood} detail="-5...5" tone="violet" />
          <MetricTile styles={styles} label="Энергия" value={`${energy}/10`} detail="сегодня" tone="teal" />
          <MetricTile styles={styles} label="Сон" value={`${sleepHours.toFixed(1)} ч`} detail="прошлая ночь" tone="gold" />
        </View>

        {!!todaySignals.length && (
          <GlassCard styles={styles}>
            <Text style={styles.sectionTitle}>Сигналы дня</Text>
            <Text style={styles.help}>
              {todaySignals.join(", ")}. Это не вывод приложения, а заметка для самонаблюдения.
            </Text>
          </GlassCard>
        )}

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Состояние</Text>
          <Stepper styles={styles} label="Настроение" value={mood} min={-5} max={5} step={1} onChange={setMood} />
          <Stepper styles={styles} label="Энергия" value={energy} min={0} max={10} step={1} onChange={setEnergy} />
          <Stepper
            styles={styles}
            label="Сон, часов"
            value={sleepHours}
            min={0}
            max={16}
            step={0.5}
            onChange={setSleepHours}
            decimals={1}
          />
        </GlassCard>

        <GlassCard styles={styles}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Эмоции за день</Text>
            <Text style={[styles.counter, completeEmotionCount < 2 && styles.warningText]}>
              {completeEmotionCount}/2
            </Text>
          </View>

          <ChipRow styles={styles}>
            {EMOTION_SUGGESTIONS.map((emotion) => (
              <Chip key={emotion} styles={styles} label={emotion} onPress={() => addEmotionSuggestion(emotion)} />
            ))}
          </ChipRow>

          <Text style={[styles.help, completeEmotionCount < 2 && styles.warningText]}>
            Для сохранения нужны минимум 2 эмоции с причиной.
          </Text>

          {emotions.map((emotion, index) => (
            <View key={emotion.id} style={styles.nestedPanel}>
              <View style={styles.rowBetween}>
                <Text style={styles.emotionTitle}>Эмоция {index + 1}</Text>
                {emotions.length > 2 && (
                  <Pressable onPress={() => removeEmotion(emotion.id)}>
                    <Text style={styles.destructiveText}>Удалить</Text>
                  </Pressable>
                )}
              </View>

              <TextInput
                value={emotion.name}
                onChangeText={(name) => updateEmotion(emotion.id, { name })}
                placeholder="Название эмоции"
                placeholderTextColor={palette.placeholder}
                style={styles.input}
              />

              <TextInput
                value={emotion.trigger}
                onChangeText={(trigger) => updateEmotion(emotion.id, { trigger })}
                placeholder="Что вызвало эту эмоцию?"
                placeholderTextColor={palette.placeholder}
                style={[styles.input, styles.multilineInput]}
                multiline
              />

              <Stepper
                styles={styles}
                label="Интенсивность"
                value={emotion.intensity}
                min={1}
                max={10}
                step={1}
                onChange={(intensity) => updateEmotion(emotion.id, { intensity })}
              />
            </View>
          ))}

          <Pressable style={styles.secondaryButton} onPress={() => setEmotions([...emotions, makeEmotionDraft()])}>
            <Text style={styles.secondaryButtonText}>Добавить эмоцию</Text>
          </Pressable>
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Факторы</Text>
          <ToggleRow styles={styles} palette={palette} label="Препараты приняты" value={medsTaken} onValueChange={setMedsTaken} />
          <ToggleRow styles={styles} palette={palette} label="Алкоголь был" value={alcoholUsed} onValueChange={setAlcoholUsed} />
          <ToggleRow styles={styles} palette={palette} label="Кофеин после 16:00" value={caffeineLate} onValueChange={setCaffeineLate} />

          <Text style={[styles.sectionTitle, styles.spacedTitle]}>Теги триггеров</Text>
          <ChipRow styles={styles}>
            {TAG_OPTIONS.map((tag) => (
              <Chip key={tag} styles={styles} label={tag} selected={triggerTags.includes(tag)} onPress={() => toggleTag(tag)} />
            ))}
          </ChipRow>
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>План на завтра</Text>
          <TextInput
            value={planTomorrow}
            onChangeText={setPlanTomorrow}
            placeholder="Один маленький шаг, который поможет завтра"
            placeholderTextColor={palette.placeholder}
            style={[styles.input, styles.multilineInput]}
            multiline
          />
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Заметка</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Что важно обсудить на терапии?"
            placeholderTextColor={palette.placeholder}
            style={[styles.input, styles.multilineInput]}
            multiline
          />
        </GlassCard>

        <Pressable
          style={[styles.primaryButton, completeEmotionCount < 2 && styles.disabledButton]}
          disabled={completeEmotionCount < 2}
          onPress={saveToday}
        >
          <Text style={styles.primaryButtonText}>Сохранить запись</Text>
        </Pressable>

        <SafetyNote styles={styles} />
      </ScrollView>
    );
  }

  function renderInsights() {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header styles={styles} eyebrow="7 дней" title="Обзор" subtitle="Паттерны для самонаблюдения и терапии" />

        <View style={styles.heroCard}>
          <MetricTile styles={styles} label="Настроение" value={insights.avgMood.toFixed(1)} detail="среднее" tone="violet" />
          <MetricTile styles={styles} label="Энергия" value={insights.avgEnergy.toFixed(1)} detail="из 10" tone="teal" />
          <MetricTile styles={styles} label="Сон" value={`${insights.avgSleep.toFixed(1)} ч`} detail="средний" tone="gold" />
        </View>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Сон, энергия, настроение</Text>
          <MiniTrend styles={styles} entries={insights.week} />
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Поводы обсудить</Text>
          {insights.flags.length ? (
            insights.flags.map((flag) => <InsightLine key={flag} styles={styles} text={flag} />)
          ) : (
            <Text style={styles.help}>Повторяющихся сигналов пока не видно. Продолжай собирать данные.</Text>
          )}
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Частые эмоции и теги</Text>
          <SummaryChips styles={styles} title="Эмоции" items={insights.topEmotions} empty="Пока нет частых эмоций" />
          <SummaryChips styles={styles} title="Теги" items={insights.topTags} empty="Пока нет частых тегов" />
        </GlassCard>

        <Pressable
          style={[styles.primaryButton, !sortedEntries.length && styles.disabledButton]}
          disabled={!sortedEntries.length}
          onPress={exportSummary}
        >
          <Text style={styles.primaryButtonText}>Экспорт сводки для терапии</Text>
        </Pressable>

        <SafetyNote styles={styles} />
      </ScrollView>
    );
  }

  function renderGoals() {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header
          styles={styles}
          eyebrow={`${filledGoals.length}/100 заполнено`}
          title="100 целей"
          subtitle="Большие желания, маленькие следующие шаги"
        />

        <View style={styles.heroCard}>
          <MetricTile styles={styles} label="Заполнено" value={filledGoals.length} detail="из 100" tone="violet" />
          <MetricTile styles={styles} label="Активно" value={activeGoals.length} detail="в работе" tone="teal" />
          <MetricTile styles={styles} label="Готово" value={doneGoals.length} detail="закрыто" tone="gold" />
        </View>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Фокус</Text>
          {focusGoal && isGoalStarted(focusGoal) ? (
            <>
              <Text style={styles.focusTitle}>{focusGoal.title || `Цель ${focusGoal.index + 1}`}</Text>
              <Text style={styles.help}>
                {focusGoal.nextStep || "Добавь один маленький следующий шаг, чтобы цель стала ближе."}
              </Text>
            </>
          ) : (
            <Text style={styles.help}>Начни с любой цели. Не обязательно писать идеально, достаточно наброска.</Text>
          )}
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Режим просмотра</Text>
          <SegmentedControl
            styles={styles}
            value={goalView}
            onChange={setGoalView}
            options={[
              { value: "all", label: "Все 100" },
              { value: "active", label: "Активные" },
              { value: "done", label: "Готовые" },
            ]}
          />
        </GlassCard>

        <Pressable style={[styles.secondaryButton, !filledGoals.length && styles.disabledButton]} disabled={!filledGoals.length} onPress={exportGoals}>
          <Text style={styles.secondaryButtonText}>Экспорт целей TXT</Text>
        </Pressable>

        {visibleGoals.length ? (
          visibleGoals.map((goal) => (
            <GoalSlot
              key={goal.id}
              styles={styles}
              palette={palette}
              goal={goal}
              expanded={Boolean(expandedGoals[goal.id])}
              onToggleExpanded={() => toggleGoalExpanded(goal.id)}
              onUpdate={(patch) => updateGoal(goal.index, patch)}
              onClear={() => clearGoal(goal)}
            />
          ))
        ) : (
          <GlassCard styles={styles}>
            <Text style={styles.help}>Готовых целей пока нет.</Text>
          </GlassCard>
        )}
      </ScrollView>
    );
  }

  function renderHistory() {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header styles={styles} eyebrow={`${sortedEntries.length} записей`} title="История" subtitle="Дни, детали и экспорт" />

        <View style={styles.exportRow}>
          <Pressable
            style={[styles.secondaryButton, sortedEntries.length === 0 && styles.disabledButton]}
            disabled={sortedEntries.length === 0}
            onPress={exportCSV}
          >
            <Text style={styles.secondaryButtonText}>CSV</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, sortedEntries.length === 0 && styles.disabledButton]}
            disabled={sortedEntries.length === 0}
            onPress={exportJSON}
          >
            <Text style={styles.secondaryButtonText}>JSON</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, sortedEntries.length === 0 && styles.disabledButton]}
            disabled={sortedEntries.length === 0}
            onPress={exportSummary}
          >
            <Text style={styles.secondaryButtonText}>TXT</Text>
          </Pressable>
        </View>

        {sortedEntries.length === 0 ? (
          <GlassCard styles={styles}>
            <Text style={styles.help}>Первая запись появится после вечерней проверки.</Text>
          </GlassCard>
        ) : (
          sortedEntries.map((entry) => (
            <Pressable key={entry.id} style={styles.historyItem} onPress={() => setSelectedEntry(entry)}>
              <View style={styles.rowBetween}>
                <Text style={styles.historyDate}>{entry.dateKey}</Text>
                <Text style={styles.historyBadge}>{entry.emotions.length} эмоц.</Text>
              </View>
              <Text style={styles.help}>
                настроение {entry.mood}, энергия {entry.energy}/10, сон {entry.sleepHours} ч
              </Text>
              {!!entry.triggerTags.length && (
                <Text style={styles.metaText}>{entry.triggerTags.join(" · ")}</Text>
              )}
            </Pressable>
          ))
        )}

        <EntryModal styles={styles} entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      </ScrollView>
    );
  }

  function renderSettings() {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Header styles={styles} eyebrow="локально" title="Настройки" subtitle="Тема, напоминания и план поддержки" />

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Внешний вид</Text>
          <SegmentedControl
            styles={styles}
            value={settings.themeMode}
            onChange={(themeMode) => persistSettings({ ...settings, themeMode })}
            options={[
              { value: "system", label: "Система" },
              { value: "light", label: "Светлая" },
              { value: "dark", label: "Темная" },
            ]}
          />
          <Text style={[styles.sectionTitle, styles.spacedTitle]}>Акцент</Text>
          <ChipRow styles={styles}>
            {Object.entries(ACCENTS).map(([key, accent]) => (
              <Chip
                key={key}
                styles={styles}
                label={accent.name}
                selected={settings.accent === key}
                onPress={() => persistSettings({ ...settings, accent: key })}
              />
            ))}
          </ChipRow>
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Вечернее напоминание</Text>
          <Stepper
            styles={styles}
            label="Час"
            value={settings.hour}
            min={0}
            max={23}
            step={1}
            onChange={(hour) => persistSettings({ ...settings, hour })}
          />
          <Stepper
            styles={styles}
            label="Минута"
            value={settings.minute}
            min={0}
            max={55}
            step={5}
            onChange={(minute) => persistSettings({ ...settings, minute })}
          />

          <Pressable style={styles.primaryButton} onPress={enableReminder}>
            <Text style={styles.primaryButtonText}>Включить напоминание</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={disableReminder}>
            <Text style={styles.secondaryButtonText}>Выключить напоминание</Text>
          </Pressable>

          <Text style={styles.help}>
            Сейчас: {String(settings.hour).padStart(2, "0")}:{String(settings.minute).padStart(2, "0")}.{" "}
            {settings.enabled ? "Напоминание включено." : "Напоминание выключено."}
          </Text>
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>План поддержки</Text>
          <TextInput
            value={settings.supportContact}
            onChangeText={(supportContact) => persistSettings({ ...settings, supportContact })}
            placeholder="Кому написать, если состояние ухудшается?"
            placeholderTextColor={palette.placeholder}
            style={styles.input}
          />
          <TextInput
            value={settings.supportPlan}
            onChangeText={(supportPlan) => persistSettings({ ...settings, supportPlan })}
            placeholder="Что помогает снизить риск: сон, врач, близкий, спокойное место"
            placeholderTextColor={palette.placeholder}
            style={[styles.input, styles.multilineInput]}
            multiline
          />
        </GlassCard>

        <GlassCard styles={styles}>
          <Text style={styles.sectionTitle}>Приватность</Text>
          <Text style={styles.help}>
            Записи и цели хранятся локально на устройстве. Экспорт запускается вручную из Истории, Обзора или Целей.
          </Text>
        </GlassCard>

        <SafetyNote styles={styles} />
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.content}>
          {tab === "today" && renderToday()}
          {tab === "insights" && renderInsights()}
          {tab === "goals" && renderGoals()}
          {tab === "history" && renderHistory()}
          {tab === "settings" && renderSettings()}
        </View>

        <View style={styles.tabGlass}>
          <TabButton styles={styles} active={tab === "today"} label="Сегодня" onPress={() => setTab("today")} />
          <TabButton styles={styles} active={tab === "insights"} label="Обзор" onPress={() => setTab("insights")} />
          <TabButton styles={styles} active={tab === "goals"} label="Цели" onPress={() => setTab("goals")} />
          <TabButton styles={styles} active={tab === "history"} label="История" onPress={() => setTab("history")} />
          <TabButton styles={styles} active={tab === "settings"} label="Настр." onPress={() => setTab("settings")} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ styles, eyebrow, title, subtitle }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function GlassCard({ styles, children }) {
  return <View style={styles.glassCard}>{children}</View>;
}

function MetricTile({ styles, label, value, detail, tone }) {
  return (
    <View style={[styles.metricTile, styles[`metric_${tone}`]]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function Stepper({ styles, label, value, min, max, step, onChange, decimals = 0 }) {
  const formatted = Number(value).toFixed(decimals);

  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>
        {label}: {formatted}
      </Text>
      <View style={styles.stepperButtons}>
        <Pressable style={styles.stepperButton} onPress={() => onChange(clamp(value - step, min, max))}>
          <Text style={styles.stepperButtonText}>-</Text>
        </Pressable>
        <Pressable style={styles.stepperButton} onPress={() => onChange(clamp(value + step, min, max))}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({ styles, palette, label, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.border, true: palette.accentSoft }}
        thumbColor={value ? palette.accent : palette.surfaceStrong}
      />
    </View>
  );
}

function SegmentedControl({ styles, value, options, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.segmentButton, value === option.value && styles.activeSegmentButton]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.segmentText, value === option.value && styles.activeSegmentText]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChipRow({ styles, children }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function Chip({ styles, label, selected = false, onPress }) {
  return (
    <Pressable style={[styles.chip, selected && styles.selectedChip]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({ styles, active, label, onPress }) {
  return (
    <Pressable style={[styles.tabButton, active && styles.activeTabButton]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.activeTabText]}>{label}</Text>
    </Pressable>
  );
}

function GoalSlot({ styles, palette, goal, expanded, onToggleExpanded, onUpdate, onClear }) {
  const started = isGoalStarted(goal);

  return (
    <View style={[styles.goalSlot, goal.done && styles.goalSlotDone]}>
      <View style={styles.goalTopRow}>
        <View style={styles.goalNumber}>
          <Text style={styles.goalNumberText}>{goal.index + 1}</Text>
        </View>
        <TextInput
          value={goal.title}
          onChangeText={(title) => onUpdate({ title })}
          placeholder="Записать цель"
          placeholderTextColor={palette.placeholder}
          style={[styles.goalTitleInput, goal.done && styles.goalDoneText]}
        />
        <Switch
          value={goal.done}
          onValueChange={(done) => onUpdate({ done })}
          trackColor={{ false: palette.border, true: palette.accentSoft }}
          thumbColor={goal.done ? palette.accent : palette.surfaceStrong}
        />
      </View>

      <View style={styles.goalActions}>
        <Pressable style={styles.inlineButton} onPress={onToggleExpanded}>
          <Text style={styles.inlineButtonText}>{expanded ? "Скрыть детали" : "Детали"}</Text>
        </Pressable>
        {started && (
          <Pressable style={styles.inlineButton} onPress={onClear}>
            <Text style={styles.destructiveText}>Очистить</Text>
          </Pressable>
        )}
      </View>

      {expanded && (
        <View style={styles.goalDetails}>
          <TextInput
            value={goal.why}
            onChangeText={(why) => onUpdate({ why })}
            placeholder="Зачем мне эта цель?"
            placeholderTextColor={palette.placeholder}
            style={[styles.input, styles.multilineInput]}
            multiline
          />
          <TextInput
            value={goal.nextStep}
            onChangeText={(nextStep) => onUpdate({ nextStep })}
            placeholder="Следующий маленький шаг"
            placeholderTextColor={palette.placeholder}
            style={[styles.input, styles.multilineInput]}
            multiline
          />
          <Text style={[styles.sectionTitle, styles.spacedTitle]}>Категория</Text>
          <ChipRow styles={styles}>
            {GOAL_CATEGORIES.map((category) => (
              <Chip
                key={category}
                styles={styles}
                label={category}
                selected={goal.category === category}
                onPress={() => onUpdate({ category: goal.category === category ? "" : category })}
              />
            ))}
          </ChipRow>
        </View>
      )}
    </View>
  );
}

function MiniTrend({ styles, entries }) {
  if (!entries.length) {
    return <Text style={styles.help}>После первой записи здесь появится мини-график.</Text>;
  }

  return (
    <View style={styles.trendRow}>
      {[...entries].reverse().map((entry) => {
        const moodHeight = clamp(((entry.mood + 5) / 10) * 82, 8, 82);
        const energyHeight = clamp((entry.energy / 10) * 82, 8, 82);
        const sleepHeight = clamp((entry.sleepHours / 10) * 82, 8, 82);

        return (
          <View key={entry.id} style={styles.trendDay}>
            <View style={styles.trendBars}>
              <View style={[styles.trendBar, styles.moodBar, { height: moodHeight }]} />
              <View style={[styles.trendBar, styles.energyBar, { height: energyHeight }]} />
              <View style={[styles.trendBar, styles.sleepBar, { height: sleepHeight }]} />
            </View>
            <Text style={styles.trendLabel}>{dateFromDayKey(entry.dateKey).getDate()}</Text>
          </View>
        );
      })}
    </View>
  );
}

function InsightLine({ styles, text }) {
  return (
    <View style={styles.insightLine}>
      <View style={styles.insightDot} />
      <Text style={styles.help}>{text}</Text>
    </View>
  );
}

function SummaryChips({ styles, title, items, empty }) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryTitle}>{title}</Text>
      {items.length ? (
        <ChipRow styles={styles}>
          {items.map((item) => (
            <View key={item.label} style={styles.readOnlyChip}>
              <Text style={styles.readOnlyChipText}>
                {item.label} · {item.count}
              </Text>
            </View>
          ))}
        </ChipRow>
      ) : (
        <Text style={styles.help}>{empty}</Text>
      )}
    </View>
  );
}

function EntryModal({ styles, entry, onClose }) {
  if (!entry) {
    return null;
  }

  return (
    <Modal animationType="slide" visible transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.title}>{entry.dateKey}</Text>
          <Text style={styles.help}>
            Настроение {entry.mood}, энергия {entry.energy}/10, сон {entry.sleepHours} ч
          </Text>

          <ScrollView style={styles.modalScroll}>
            <View style={styles.nestedPanel}>
              <Text style={styles.sectionTitle}>Факторы</Text>
              <Text style={styles.help}>
                Препараты: {entry.medsTaken ? "да" : "не отмечено"} · алкоголь: {entry.alcoholUsed ? "да" : "нет"} ·
                кофеин после 16:00: {entry.caffeineLate ? "да" : "нет"}
              </Text>
              {!!entry.triggerTags.length && <Text style={styles.metaText}>{entry.triggerTags.join(" · ")}</Text>}
            </View>

            {entry.emotions.map((emotion) => (
              <View key={emotion.id} style={styles.nestedPanel}>
                <Text style={styles.emotionTitle}>
                  {emotion.name} - {emotion.intensity}/10
                </Text>
                <Text style={styles.help}>{emotion.trigger}</Text>
              </View>
            ))}

            {!!entry.planTomorrow && (
              <View style={styles.nestedPanel}>
                <Text style={styles.sectionTitle}>План на завтра</Text>
                <Text style={styles.help}>{entry.planTomorrow}</Text>
              </View>
            )}

            {!!entry.notes && (
              <View style={styles.nestedPanel}>
                <Text style={styles.sectionTitle}>Заметка</Text>
                <Text style={styles.help}>{entry.notes}</Text>
              </View>
            )}
          </ScrollView>

          <Pressable style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Закрыть</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SafetyNote({ styles }) {
  return (
    <View style={styles.safety}>
      <Text style={styles.safetyTitle}>Важно</Text>
      <Text style={styles.safetyText}>
        Это дневник самонаблюдения, а не замена врачу или терапии. Если появляются мысли о самоповреждении,
        резкий подъем энергии без сна, опасная импульсивность или ощущение потери контроля, свяжись с лечащим
        врачом или экстренной помощью.
      </Text>
    </View>
  );
}

function createStyles(palette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: palette.background,
    },
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
    },
    page: {
      padding: 16,
      paddingBottom: 28,
    },
    header: {
      marginBottom: 14,
      paddingTop: 6,
    },
    eyebrow: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
      textTransform: "uppercase",
    },
    title: {
      color: palette.text,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: 0,
    },
    subtitle: {
      color: palette.muted,
      fontSize: 15,
      marginTop: 3,
    },
    heroCard: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    metricTile: {
      borderColor: palette.cardBorder,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      minHeight: 104,
      padding: 12,
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: palette.dark ? 0.32 : 0.12,
      shadowRadius: 16,
    },
    metric_violet: {
      backgroundColor: palette.metricViolet,
    },
    metric_teal: {
      backgroundColor: palette.metricTeal,
    },
    metric_gold: {
      backgroundColor: palette.metricGold,
    },
    metricLabel: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
    },
    metricValue: {
      color: palette.metricText,
      fontSize: 24,
      fontWeight: "900",
      marginTop: 8,
    },
    metricDetail: {
      color: palette.subtle,
      fontSize: 12,
      marginTop: 3,
    },
    glassCard: {
      backgroundColor: palette.surface,
      borderColor: palette.cardBorder,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 12,
      padding: 14,
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: palette.dark ? 0.28 : 0.1,
      shadowRadius: 18,
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 10,
    },
    spacedTitle: {
      marginTop: 14,
    },
    help: {
      color: palette.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    warningText: {
      color: palette.warningText,
    },
    counter: {
      color: palette.accent,
      fontSize: 15,
      fontWeight: "900",
    },
    focusTitle: {
      color: palette.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 6,
    },
    input: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      color: palette.text,
      fontSize: 16,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    multilineInput: {
      minHeight: 82,
      textAlignVertical: "top",
    },
    nestedPanel: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 12,
      padding: 12,
    },
    emotionTitle: {
      color: palette.text,
      fontSize: 16,
      fontWeight: "800",
    },
    rowBetween: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    destructiveText: {
      color: palette.danger,
      fontSize: 14,
      fontWeight: "800",
    },
    stepper: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 10,
    },
    stepperLabel: {
      color: palette.text,
      flex: 1,
      fontSize: 16,
    },
    stepperButtons: {
      flexDirection: "row",
      gap: 8,
    },
    stepperButton: {
      alignItems: "center",
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderRadius: 8,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 42,
    },
    stepperButtonText: {
      color: palette.accent,
      fontSize: 22,
      fontWeight: "900",
    },
    toggleRow: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 9,
    },
    toggleLabel: {
      color: palette.text,
      flex: 1,
      fontSize: 16,
    },
    segmented: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      padding: 4,
    },
    segmentButton: {
      alignItems: "center",
      borderRadius: 8,
      flex: 1,
      paddingVertical: 10,
    },
    activeSegmentButton: {
      backgroundColor: palette.accent,
    },
    segmentText: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: "800",
    },
    activeSegmentText: {
      color: palette.accentText,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
    },
    chip: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    selectedChip: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
    },
    chipText: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: "700",
    },
    selectedChipText: {
      color: palette.accent,
    },
    readOnlyChip: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    readOnlyChipText: {
      color: palette.accent,
      fontSize: 13,
      fontWeight: "800",
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 8,
      marginBottom: 12,
      marginTop: 4,
      paddingVertical: 15,
      shadowColor: palette.accentStrong,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: palette.dark ? 0.32 : 0.18,
      shadowRadius: 14,
    },
    primaryButtonText: {
      color: palette.accentText,
      fontSize: 16,
      fontWeight: "900",
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    secondaryButtonText: {
      color: palette.accent,
      fontSize: 15,
      fontWeight: "900",
    },
    inlineButton: {
      backgroundColor: palette.surfaceMuted,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    inlineButtonText: {
      color: palette.accent,
      fontSize: 13,
      fontWeight: "800",
    },
    disabledButton: {
      opacity: 0.45,
    },
    goalSlot: {
      backgroundColor: palette.surface,
      borderColor: palette.cardBorder,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 10,
      padding: 12,
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: palette.dark ? 0.24 : 0.08,
      shadowRadius: 14,
    },
    goalSlotDone: {
      opacity: 0.72,
    },
    goalTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    goalNumber: {
      alignItems: "center",
      backgroundColor: palette.accentSoft,
      borderRadius: 8,
      height: 36,
      justifyContent: "center",
      width: 42,
    },
    goalNumberText: {
      color: palette.accent,
      fontSize: 14,
      fontWeight: "900",
    },
    goalTitleInput: {
      color: palette.text,
      flex: 1,
      fontSize: 16,
      fontWeight: "700",
      paddingVertical: 8,
    },
    goalDoneText: {
      color: palette.subtle,
      textDecorationLine: "line-through",
    },
    goalActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
    },
    goalDetails: {
      marginTop: 2,
    },
    historyItem: {
      backgroundColor: palette.surface,
      borderColor: palette.cardBorder,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 10,
      padding: 14,
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: palette.dark ? 0.24 : 0.08,
      shadowRadius: 14,
    },
    historyDate: {
      color: palette.text,
      fontSize: 17,
      fontWeight: "900",
      marginBottom: 4,
    },
    historyBadge: {
      backgroundColor: palette.secondarySoft,
      borderRadius: 8,
      color: palette.secondaryAccent,
      fontSize: 12,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    metaText: {
      color: palette.accent,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 8,
    },
    exportRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    tabGlass: {
      backgroundColor: palette.tab,
      borderColor: palette.cardBorder,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingBottom: 8,
      paddingHorizontal: 8,
      paddingTop: 8,
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: palette.dark ? 0.32 : 0.08,
      shadowRadius: 16,
    },
    tabButton: {
      alignItems: "center",
      borderRadius: 8,
      flex: 1,
      paddingVertical: 10,
    },
    activeTabButton: {
      backgroundColor: palette.accentSoft,
    },
    tabText: {
      color: palette.muted,
      fontSize: 11,
      fontWeight: "800",
    },
    activeTabText: {
      color: palette.accent,
    },
    trendRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 118,
    },
    trendDay: {
      alignItems: "center",
      flex: 1,
    },
    trendBars: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 3,
      height: 88,
    },
    trendBar: {
      borderRadius: 4,
      width: 6,
    },
    moodBar: {
      backgroundColor: palette.accent,
    },
    energyBar: {
      backgroundColor: "#2aa796",
    },
    sleepBar: {
      backgroundColor: palette.secondaryAccent,
    },
    trendLabel: {
      color: palette.subtle,
      fontSize: 11,
      marginTop: 7,
    },
    insightLine: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 9,
      marginBottom: 9,
    },
    insightDot: {
      backgroundColor: palette.secondaryAccent,
      borderRadius: 4,
      height: 8,
      marginTop: 6,
      width: 8,
    },
    summaryBlock: {
      marginBottom: 12,
    },
    summaryTitle: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: "900",
      marginBottom: 8,
    },
    modalBackdrop: {
      backgroundColor: "rgba(0,0,0,0.55)",
      flex: 1,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: palette.background,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      maxHeight: "85%",
      padding: 16,
    },
    modalHandle: {
      alignSelf: "center",
      backgroundColor: palette.border,
      borderRadius: 3,
      height: 5,
      marginBottom: 12,
      width: 46,
    },
    modalScroll: {
      marginTop: 12,
    },
    safety: {
      backgroundColor: palette.safetyBg,
      borderColor: palette.safetyBorder,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 2,
      padding: 14,
    },
    safetyTitle: {
      color: palette.safetyText,
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 6,
    },
    safetyText: {
      color: palette.safetyText,
      fontSize: 13,
      lineHeight: 19,
    },
  });
}
