import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AudioMonitor } from '../services/AudioMonitor';
import {
  startForegroundService,
  stopForegroundService,
  updateForegroundNotification,
} from '../services/ForegroundService';

// ─── Palette nuit ─────────────────────────────────────────────────────────────
const C = {
  bg: '#070b14',
  surface: '#0e1623',
  border: '#1a2540',
  accent: '#4f9cf9',
  accentDim: '#1a3a6b',
  danger: '#f94f6e',
  success: '#4ff9a0',
  text: '#e8edf5',
  muted: '#4a5568',
  yellow: '#f9c84f',
};

const BAR_COUNT = 24;

export default function MonitorScreen({ onNewEvent, maxRecordings, onMaxRecordingsChange }) {
  const insets = useSafeAreaInsets();
  const [isRunning, setIsRunning] = useState(false);
  const [threshold, setThreshold] = useState(-40); // dBFS
  const [currentLevel, setCurrentLevel] = useState(-160);
  const [eventCount, setEventCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const [debugLog, setDebugLog] = useState([]);

  const monitorRef = useRef(null);
  const elapsedRef = useRef(null);
  const startTimeRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const levelAnim = useRef(new Animated.Value(0)).current;

  // Barre de niveau : 0→1 mappé de -80dBFS à 0dBFS
  const normalizedLevel = Math.max(0, Math.min(1, (currentLevel + 80) / 80));

  // Animations
  useEffect(() => {
    if (isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning]);

  useEffect(() => {
    Animated.timing(levelAnim, {
      toValue: normalizedLevel,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [normalizedLevel]);

  // Glow quand son détecté
  const triggerGlow = useCallback(() => {
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 80, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
    ]).start();
  }, []);

  const handleLevelUpdate = useCallback((dB) => {
    setCurrentLevel(dB);
    if (dB > threshold) {
      triggerGlow();
    }
  }, [threshold, triggerGlow]);

  const handleDebug = useCallback((msg) => {
    setDebugLog(prev => [...prev.slice(-4), msg]);
  }, []);

  const handleEvent = useCallback((event) => {
    setEventCount(c => {
      const next = c + 1;
      updateForegroundNotification(next);
      return next;
    });
    onNewEvent?.(event);
  }, [onNewEvent]);

  const startMonitoring = async () => {
    await startForegroundService();
    setDebugLog([]);
    const monitor = new AudioMonitor({
      threshold,
      onEvent: handleEvent,
      onLevelUpdate: handleLevelUpdate,
      onDebug: handleDebug,
    });
    monitorRef.current = monitor;
    await monitor.start();
    setIsRunning(true);
    setEventCount(0);
    startTimeRef.current = Date.now();
    await activateKeepAwakeAsync();

    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopMonitoring = async () => {
    await monitorRef.current?.stop();
    monitorRef.current = null;
    clearInterval(elapsedRef.current);
    setIsRunning(false);
    setCurrentLevel(-160);
    setElapsed(0);
    deactivateKeepAwake();
    await stopForegroundService();
  };

  const toggleMonitoring = async () => {
    try {
      if (isRunning) {
        await stopMonitoring();
      } else {
        await startMonitoring();
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || String(e));
      console.error('toggleMonitoring error:', e);
    }
  };

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      monitorRef.current?.stop();
      clearInterval(elapsedRef.current);
      deactivateKeepAwake();
      stopForegroundService();
    };
  }, []);

  const formatElapsed = (s) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  // Slider custom (simple, sans lib externe)
  const thresholdOptions = [-70, -60, -50, -40, -30, -20, -10];

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(79, 156, 249, 0)', 'rgba(249, 79, 110, 0.4)'],
  });

  const levelColor = levelAnim.interpolate({
    inputRange: [0, 0.5, 0.8, 1],
    outputRange: [C.accentDim, C.accent, C.yellow, C.danger],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SleepTalker</Text>
        <Text style={styles.subtitle}>
          {isRunning ? 'Surveillance active' : 'Prêt à surveiller'}
        </Text>
      </View>

      {/* Orbe principale */}
      <View style={styles.orbeContainer}>
        <Animated.View
          style={[
            styles.glowRing,
            { backgroundColor: glowColor, transform: [{ scale: pulseAnim }] }
          ]}
        />
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.orbe, isRunning && styles.orbeActive]}
            onPress={toggleMonitoring}
            activeOpacity={0.85}
          >
            <Text style={styles.orbeIcon}>{isRunning ? '◼' : '▶'}</Text>
            <Text style={styles.orbeLabel}>
              {isRunning ? 'Arrêter' : 'Démarrer'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Niveau sonore */}
      <View style={styles.levelSection}>
        <View style={styles.levelHeader}>
          <Text style={styles.sectionLabel}>Niveau sonore</Text>
          <Text style={styles.levelValue}>
            {currentLevel > -155 ? `${currentLevel.toFixed(0)} dBFS` : '–'}
          </Text>
        </View>
        <View style={styles.levelBarBg}>
          <Animated.View
            style={[
              styles.levelBarFill,
              {
                width: levelAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: levelColor,
              },
            ]}
          />
          {/* Marqueur de seuil */}
          <View
            style={[
              styles.thresholdMarker,
              { left: `${Math.max(0, Math.min(100, ((threshold + 80) / 80) * 100))}%` },
            ]}
          />
        </View>
        <View style={styles.levelScale}>
          <Text style={styles.levelScaleText}>-80</Text>
          <Text style={styles.levelScaleText}>-60</Text>
          <Text style={styles.levelScaleText}>-40</Text>
          <Text style={styles.levelScaleText}>-20</Text>
          <Text style={styles.levelScaleText}>0 dB</Text>
        </View>
      </View>

      {/* Sensibilité */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Seuil de déclenchement — <Text style={styles.thresholdValue}>{threshold} dBFS</Text>
        </Text>
        <View style={styles.thresholdRow}>
          {thresholdOptions.map(val => (
            <TouchableOpacity
              key={val}
              style={[
                styles.thresholdBtn,
                threshold === val && styles.thresholdBtnActive,
              ]}
              onPress={() => setThreshold(val)}
              disabled={isRunning}
            >
              <Text style={[
                styles.thresholdBtnText,
                threshold === val && styles.thresholdBtnTextActive,
              ]}>
                {val}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.sensitivityLabels}>
          <Text style={styles.sensitivityLabel}>← Plus sensible</Text>
          <Text style={styles.sensitivityLabel}>Moins sensible →</Text>
        </View>
      </View>

      {/* Max enregistrements */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Max enregistrements — <Text style={styles.thresholdValue}>{maxRecordings}</Text>
        </Text>
        <View style={styles.thresholdRow}>
          {[5, 10, 20, 50, 100].map(val => (
            <TouchableOpacity
              key={val}
              style={[
                styles.thresholdBtn,
                maxRecordings === val && styles.thresholdBtnActive,
              ]}
              onPress={() => onMaxRecordingsChange?.(val)}
              disabled={isRunning}
            >
              <Text style={[
                styles.thresholdBtnText,
                maxRecordings === val && styles.thresholdBtnTextActive,
              ]}>
                {val}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats de session */}
      {isRunning && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatElapsed(elapsed)}</Text>
            <Text style={styles.statLabel}>Durée</Text>
          </View>
          <View style={[styles.statCard, eventCount > 0 && styles.statCardAlert]}>
            <Text style={[styles.statValue, eventCount > 0 && { color: C.danger }]}>
              {eventCount}
            </Text>
            <Text style={styles.statLabel}>
              {eventCount <= 1 ? 'Événement' : 'Événements'}
            </Text>
          </View>
        </View>
      )}

      {/* Debug log */}
      {isRunning && debugLog.length > 0 && (
        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>DEBUG</Text>
          {debugLog.map((msg, i) => (
            <Text key={i} style={styles.debugText}>{msg}</Text>
          ))}
        </View>
      )}

      {/* Info */}
      {!isRunning && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Place ton téléphone sur ta table de nuit, micro vers le haut.
            Les clips de 30s dépassant le seuil seront automatiquement sauvegardés.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  orbeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    height: 160,
  },
  glowRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  orbe: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  orbeActive: {
    borderColor: C.accent,
    backgroundColor: '#0d1e3a',
    shadowOpacity: 0.6,
  },
  orbeIcon: {
    fontSize: 30,
    color: C.accent,
    marginBottom: 4,
  },
  orbeLabel: {
    fontSize: 12,
    color: C.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  levelSection: {
    marginBottom: 24,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  levelValue: {
    fontSize: 12,
    color: C.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  levelBarBg: {
    height: 8,
    backgroundColor: C.surface,
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  },
  levelBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  thresholdMarker: {
    position: 'absolute',
    top: -4,
    width: 2,
    height: 16,
    backgroundColor: C.yellow,
    borderRadius: 1,
    marginLeft: -1,
  },
  levelScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  levelScaleText: {
    fontSize: 9,
    color: C.muted,
  },
  section: {
    marginBottom: 24,
  },
  thresholdValue: {
    color: C.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 6,
  },
  thresholdBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  thresholdBtnActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accent,
  },
  thresholdBtnText: {
    fontSize: 11,
    color: C.muted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  thresholdBtnTextActive: {
    color: C.accent,
  },
  sensitivityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sensitivityLabel: {
    fontSize: 9,
    color: C.muted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  statCardAlert: {
    borderColor: C.danger,
    backgroundColor: '#1a0d12',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statLabel: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  infoText: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 20,
  },
  debugBox: {
    marginTop: 12,
    backgroundColor: '#1a1a0d',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#3a3a1a',
  },
  debugTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: C.yellow,
    marginBottom: 4,
    letterSpacing: 1,
  },
  debugText: {
    fontSize: 10,
    color: '#aaa',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 14,
  },
});
