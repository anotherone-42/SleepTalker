import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import {
  getSavedRecordings,
  deleteRecording,
  formatDate,
  formatTime,
} from '../services/AudioMonitor';

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
};

// Regroupe les enregistrements par date (nuit)
function groupByDate(recordings) {
  const groups = {};
  recordings.forEach(rec => {
    const key = formatDate(rec.timestamp);
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  });
  return Object.entries(groups).map(([date, items]) => ({ date, items }));
}

export default function RecordingsScreen({ refreshTrigger, maxRecordings = 10 }) {
  const insets = useSafeAreaInsets();
  const [recordings, setRecordings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [playingUri, setPlayingUri] = useState(null);
  const [playbackPos, setPlaybackPos] = useState(0);
  const soundRef = useRef(null);

  const loadRecordings = useCallback(async () => {
    const recs = await getSavedRecordings(maxRecordings);
    setRecordings(recs);
  }, [maxRecordings]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings, refreshTrigger]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecordings();
    setRefreshing(false);
  };

  const stopCurrent = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingUri(null);
    setPlaybackPos(0);
  };

  const togglePlay = async (uri) => {
    if (playingUri === uri) {
      await stopCurrent();
      return;
    }

    await stopCurrent();

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            if (status.durationMillis) {
              setPlaybackPos(status.positionMillis / status.durationMillis);
            }
            if (status.didJustFinish) {
              setPlayingUri(null);
              setPlaybackPos(0);
            }
          }
        }
      );
      soundRef.current = sound;
      setPlayingUri(uri);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de lire cet enregistrement.');
    }
  };

  const confirmDelete = (rec) => {
    Alert.alert(
      'Supprimer',
      `Supprimer l'enregistrement du ${formatTime(rec.timestamp)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (playingUri === rec.uri) await stopCurrent();
            await deleteRecording(rec.uri);
            await loadRecordings();
          },
        },
      ]
    );
  };

  const groups = groupByDate(recordings);

  const renderItem = ({ item: rec }) => {
    const isPlaying = playingUri === rec.uri;
    return (
      <View style={styles.recCard}>
        <View style={styles.recInfo}>
          <Text style={styles.recTime}>{formatTime(rec.timestamp)}</Text>
          <Text style={styles.recDuration}>{rec.durationMs ? `${Math.round(rec.durationMs / 1000)}s` : ''}</Text>
        </View>

        {isPlaying && (
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${playbackPos * 100}%` }]} />
          </View>
        )}

        <View style={styles.recActions}>
          <TouchableOpacity
            style={[styles.playBtn, isPlaying && styles.playBtnActive]}
            onPress={() => togglePlay(rec.uri)}
          >
            <Text style={styles.playBtnText}>{isPlaying ? '⏹' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => confirmDelete(rec)}
          >
            <Text style={styles.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGroup = ({ item: group }) => (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupDate}>{group.date}</Text>
        <View style={styles.groupBadge}>
          <Text style={styles.groupBadgeText}>
            {group.items.length} clip{group.items.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>
      {group.items.map(rec => renderItem({ item: rec }))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Enregistrements</Text>
        <Text style={styles.subtitle}>{recordings.length} clip{recordings.length !== 1 ? 's' : ''} sauvegardé{recordings.length !== 1 ? 's' : ''}</Text>
      </View>

      {recordings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🌙</Text>
          <Text style={styles.emptyTitle}>Aucun enregistrement</Text>
          <Text style={styles.emptyText}>
            Lance la surveillance et les clips apparaîtront ici quand un son est détecté.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.date}
          renderItem={renderGroup}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        />
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
  },
  group: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  groupDate: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'capitalize',
  },
  groupBadge: {
    backgroundColor: C.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  groupBadgeText: {
    fontSize: 11,
    color: C.accent,
  },
  recCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  recInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recTime: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  recDuration: {
    fontSize: 12,
    color: C.muted,
  },
  progressBg: {
    height: 3,
    backgroundColor: C.border,
    borderRadius: 2,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 2,
  },
  recActions: {
    flexDirection: 'row',
    gap: 8,
  },
  playBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.accent,
  },
  playBtnActive: {
    backgroundColor: '#1a3060',
  },
  playBtnText: {
    fontSize: 16,
    color: C.accent,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1a0d12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3a1a22',
  },
  deleteBtnText: {
    fontSize: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
