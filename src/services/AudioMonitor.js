import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// Dossier de sauvegarde des enregistrements
export const RECORDINGS_DIR = FileSystem.documentDirectory + 'sleep_recordings/';

// Polling du niveau sonore toutes les 100ms
const POLL_INTERVAL_MS = 100;
// Durée de silence avant de couper l'enregistrement (3s)
const SILENCE_TIMEOUT_MS = 3_000;
// Durée max d'un enregistrement pour éviter les fichiers géants (5min)
const MAX_CAPTURE_MS = 300_000;
// En mode écoute, on relance le recording toutes les 30s pour éviter les gros fichiers temp
const MONITOR_RESTART_MS = 30_000;
// Nombre max d'enregistrements par défaut
const DEFAULT_MAX_RECORDINGS = 10;

/**
 * AudioMonitor — surveille le micro en permanence.
 *
 * Mode ÉCOUTE : enregistre pour le metering mais supprime le fichier.
 * Quand le seuil est franchi → passe en mode CAPTURE.
 *
 * Mode CAPTURE : enregistre et sauvegarde.
 * Quand silence > 3s → sauvegarde et repasse en ÉCOUTE.
 */
export class AudioMonitor {
  constructor({ threshold, onEvent, onLevelUpdate, onDebug }) {
    this.threshold = threshold;
    this.onEvent = onEvent;
    this.onLevelUpdate = onLevelUpdate;
    this.onDebug = onDebug;

    this.recording = null;
    this.pollTimer = null;
    this.isRunning = false;

    // État : 'monitoring' (écoute) ou 'capturing' (enregistrement actif)
    this.state = 'monitoring';
    this.captureStart = null;
    this.lastSoundTime = null;
    this.monitorStartTime = null;
  }

  async ensureDir() {
    const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
    }
  }

  async requestPermissions() {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission micro refusée');
  }

  async _createRecording() {
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 64000,
      },
      ios: {
        extension: '.m4a',
        audioQuality: Audio.IOSAudioQuality.MEDIUM,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 64000,
      },
      isMeteringEnabled: true,
    });
    await recording.startAsync();
    return recording;
  }

  async _stopAndGetUri(recording) {
    try {
      await recording.stopAndUnloadAsync();
    } catch (e) {
      console.error('Erreur arrêt recording:', e);
    }
    return recording.getURI();
  }

  async _deleteUri(uri) {
    if (uri) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    }
  }

  async start() {
    await this.ensureDir();
    await this.requestPermissions();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
    this.isRunning = true;
    this.state = 'monitoring';
    this.onDebug?.('Mode ÉCOUTE — en attente de son…');
    await this._startRecording();
  }

  async _startRecording() {
    if (!this.isRunning) return;
    try {
      this.recording = await this._createRecording();
      if (this.state === 'monitoring') {
        this.monitorStartTime = Date.now();
      }
    } catch (e) {
      console.error('Erreur démarrage enregistrement:', e);
      return;
    }
    this._startPolling();
  }

  _startPolling() {
    this.pollTimer = setInterval(async () => {
      if (!this.recording || !this.isRunning) return;
      try {
        const status = await this.recording.getStatusAsync();
        if (!status.isRecording || status.metering === undefined) return;

        const level = status.metering;
        this.onLevelUpdate?.(level);
        const now = Date.now();

        if (this.state === 'monitoring') {
          // En écoute : on attend que le seuil soit franchi
          if (level >= this.threshold) {
            // Son détecté ! On jette le recording d'écoute et on en démarre un de capture
            this.onDebug?.(`Son détecté (${level.toFixed(0)}dB) → CAPTURE`);
            await this._switchToCapture();
            return;
          }
          // Relance périodique pour éviter les gros fichiers temp
          if (now - this.monitorStartTime > MONITOR_RESTART_MS) {
            await this._restartMonitoring();
          }
        } else if (this.state === 'capturing') {
          // En capture : on traque le dernier son
          if (level >= this.threshold) {
            this.lastSoundTime = now;
          }
          // Silence depuis 3s → sauvegarder
          if (now - this.lastSoundTime > SILENCE_TIMEOUT_MS) {
            this.onDebug?.('Silence 3s → sauvegarde…');
            await this._saveCapture();
            return;
          }
          // Sécurité : durée max
          if (now - this.captureStart > MAX_CAPTURE_MS) {
            this.onDebug?.('Durée max atteinte → sauvegarde…');
            await this._saveCapture();
            return;
          }
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  _stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async _switchToCapture() {
    this._stopPolling();

    // Jeter le recording d'écoute
    const oldRec = this.recording;
    this.recording = null;
    const oldUri = await this._stopAndGetUri(oldRec);
    await this._deleteUri(oldUri);

    // Démarrer un nouveau recording pour la capture
    this.state = 'capturing';
    this.captureStart = Date.now();
    this.lastSoundTime = Date.now();
    await this._startRecording();
  }

  async _saveCapture() {
    this._stopPolling();

    const recording = this.recording;
    const captureStart = this.captureStart;
    this.recording = null;

    const uri = await this._stopAndGetUri(recording);
    const durationMs = Date.now() - captureStart;

    if (uri) {
      const timestamp = new Date(captureStart);
      const filename = `sleep_${captureStart}.m4a`;
      const dest = RECORDINGS_DIR + filename;
      try {
        await FileSystem.moveAsync({ from: uri, to: dest });
        const durationSec = Math.round(durationMs / 1000);
        this.onDebug?.(`SAUVEGARDÉ → ${filename} (${durationSec}s)`);
        this.onEvent?.({
          timestamp,
          uri: dest,
          filename,
          durationMs,
        });
      } catch (e) {
        this.onDebug?.(`ERREUR SAVE: ${e.message}`);
        console.error('Erreur sauvegarde clip:', e);
      }
    } else {
      this.onDebug?.('PAS DE URI — enregistrement échoué');
    }

    // Retour en mode écoute
    this.state = 'monitoring';
    this.onDebug?.('Mode ÉCOUTE — en attente de son…');
    await this._startRecording();
  }

  async _restartMonitoring() {
    this._stopPolling();
    const oldRec = this.recording;
    this.recording = null;
    const oldUri = await this._stopAndGetUri(oldRec);
    await this._deleteUri(oldUri);
    await this._startRecording();
  }

  async stop() {
    this.isRunning = false;
    this._stopPolling();
    this.onLevelUpdate?.(-160);

    if (this.recording) {
      const recording = this.recording;
      const wasCapturing = this.state === 'capturing';
      const captureStart = this.captureStart;
      this.recording = null;

      const uri = await this._stopAndGetUri(recording);

      if (wasCapturing && uri) {
        // Sauvegarder la capture en cours
        const durationMs = Date.now() - captureStart;
        const timestamp = new Date(captureStart);
        const filename = `sleep_${captureStart}.m4a`;
        const dest = RECORDINGS_DIR + filename;
        try {
          await FileSystem.moveAsync({ from: uri, to: dest });
          this.onDebug?.(`SAUVEGARDÉ (stop) → ${filename}`);
          this.onEvent?.({
            timestamp,
            uri: dest,
            filename,
            durationMs,
          });
        } catch (e) {
          console.error('Erreur sauvegarde clip (stop):', e);
        }
      } else {
        await this._deleteUri(uri);
      }
    }
  }
}

// ─── Helpers pour la liste des enregistrements ───────────────────────────────

export async function getSavedRecordings(maxRecordings = DEFAULT_MAX_RECORDINGS) {
  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) return [];

  const files = await FileSystem.readDirectoryAsync(RECORDINGS_DIR);
  const recs = files
    .filter(f => f.endsWith('.m4a'))
    .map(f => {
      const ts = parseInt(f.replace('sleep_', '').replace('.m4a', ''), 10);
      return {
        filename: f,
        uri: RECORDINGS_DIR + f,
        timestamp: new Date(isNaN(ts) ? 0 : ts),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  // Supprimer les plus anciens au-delà de la limite
  if (recs.length > maxRecordings) {
    const toDelete = recs.splice(maxRecordings);
    for (const rec of toDelete) {
      try {
        await FileSystem.deleteAsync(rec.uri, { idempotent: true });
      } catch {}
    }
  }

  return recs;
}

export async function deleteRecording(uri) {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export function formatTimestamp(date) {
  return date.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTime(date) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDate(date) {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
