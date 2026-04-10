import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_LOGS = 1000; // Garder les 1000 derniers logs
const LOG_KEY = '@sleeptalker_logs';
const ANALYTICS_KEY = '@sleeptalker_analytics';

const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

const EventType = {
  // Cycle de vie
  APP_START: 'APP_START',
  APP_STOP: 'APP_STOP',
  MONITOR_START: 'MONITOR_START',
  MONITOR_STOP: 'MONITOR_STOP',
  
  // Permissions
  PERMISSION_REQUESTED: 'PERMISSION_REQUESTED',
  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // Enregistrement
  RECORDING_STARTED: 'RECORDING_STARTED',
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  SOUND_DETECTED: 'SOUND_DETECTED',
  SILENCE_DETECTED: 'SILENCE_DETECTED',
  CAPTURE_STARTED: 'CAPTURE_STARTED',
  CAPTURE_SAVED: 'CAPTURE_SAVED',
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  
  // Monitoring du son
  LEVEL_UPDATE: 'LEVEL_UPDATE',
  THRESHOLD_CHANGED: 'THRESHOLD_CHANGED',
  
  // Service de foreground
  FOREGROUND_SERVICE_START: 'FOREGROUND_SERVICE_START',
  FOREGROUND_SERVICE_STOP: 'FOREGROUND_SERVICE_STOP',
  FOREGROUND_SERVICE_UPDATE: 'FOREGROUND_SERVICE_UPDATE',
  
  // Erreurs
  ERROR: 'ERROR',
};

class Logger {
  constructor() {
    this.logs = [];
    this.listeners = [];
    this.initialized = false;
    this.sessionId = null;
  }

  async init() {
    try {
      // Générer un ID de session unique
      this.sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Charger les logs existants
      const stored = await AsyncStorage.getItem(LOG_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      } else {
        this.logs = [];
      }
      this.initialized = true;
      
      // Charger les analytics
      const analytics = await AsyncStorage.getItem(ANALYTICS_KEY);
      if (!analytics) {
        await this._saveAnalytics({
          sessionsStarted: 0,
          clipsRecorded: 0,
          totalRecordingTime: 0,
          errors: 0,
          lastSessionDate: null,
        });
      }
      
      this.info('Logger initialized', { sessionId: this.sessionId });
    } catch (e) {
      console.error('Logger init error:', e);
    }
  }

  /**
   * Log un événement
   */
  log(type, level, message, data = {}) {
    if (!this.initialized) return;
    
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      sessionId: this.sessionId,
      type,
      level,
      message,
      data,
    };
    
    this.logs.push(entry);
    
    // Garder seulement les MAX_LOGS derniers logs
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
    
    // Notifier les listeners
    this.listeners.forEach(cb => cb(entry));
    
    // Log console pour le debug
    const prefix = `[${level}] [${type}]`;
    if (level === LogLevel.ERROR) {
      console.error(prefix, message, data);
    } else if (level === LogLevel.WARN) {
      console.warn(prefix, message, data);
    } else {
      console.log(prefix, message, data);
    }
    
    // Persister asynchronement
    this._persist();
  }

  // ─── Méthodes raccourci ───────────────────────────────────────────────

  debug(message, data) {
    this.log(EventType.ERROR, LogLevel.DEBUG, message, data);
  }

  info(message, data) {
    this.log(EventType.INFO, LogLevel.INFO, message, data);
  }

  warn(message, data) {
    this.log(EventType.WARN, LogLevel.WARN, message, data);
  }

  error(type, message, data) {
    this.log(type || EventType.ERROR, LogLevel.ERROR, message, data);
  }

  // ─── Événements spécifiques ──────────────────────────────────────────

  recordMonitorStart(threshold) {
    this.log(EventType.MONITOR_START, LogLevel.INFO, 'Monitor started', { threshold });
  }

  recordMonitorStop() {
    this.log(EventType.MONITOR_STOP, LogLevel.INFO, 'Monitor stopped', {});
  }

  recordPermissionRequested() {
    this.log(EventType.PERMISSION_REQUESTED, LogLevel.INFO, 'Microphone permission requested', {});
  }

  recordPermissionGranted() {
    this.log(EventType.PERMISSION_GRANTED, LogLevel.INFO, 'Microphone permission granted', {});
  }

  recordPermissionDenied(error) {
    this.log(EventType.PERMISSION_DENIED, LogLevel.ERROR, 'Microphone permission denied', { error: error?.message });
  }

  recordRecordingStarted(mode = 'monitoring') {
    this.log(EventType.RECORDING_STARTED, LogLevel.DEBUG, `Recording started (${mode})`, { mode });
  }

  recordSoundDetected(level, threshold) {
    this.log(EventType.SOUND_DETECTED, LogLevel.INFO, `Sound detected at ${level.toFixed(0)}dB`, {
      level: level.toFixed(0),
      threshold,
      margin: (level - threshold).toFixed(0),
    });
  }

  recordCaptureStarted() {
    this.log(EventType.CAPTURE_STARTED, LogLevel.INFO, 'Capture mode started', {});
  }

  recordSilenceDetected(duration) {
    this.log(EventType.SILENCE_DETECTED, LogLevel.INFO, `Silence detected for ${Math.round(duration / 1000)}s`, { durationMs: duration });
  }

  recordCaptureSaved(filename, durationMs) {
    this.log(EventType.CAPTURE_SAVED, LogLevel.INFO, `Clip saved: ${filename}`, {
      filename,
      durationSec: Math.round(durationMs / 1000),
      durationMs,
    });
    
    // Mettre à jour les analytics
    this._updateAnalytics({
      clipsRecorded: 1,
      totalRecordingTime: durationMs,
    });
  }

  recordCaptureFailed(filename, error) {
    this.log(EventType.CAPTURE_FAILED, LogLevel.ERROR, `Failed to save clip: ${filename}`, {
      filename,
      error: error?.message || error,
    });
    
    this._updateAnalytics({ errors: 1 });
  }

  recordLevelUpdate(level) {
    // Éviter de spammer les logs avec trop de level updates
    const lastLevel = this.logs[this.logs.length - 1];
    if (lastLevel?.type === EventType.LEVEL_UPDATE && Date.now() - new Date(lastLevel.timestamp) < 1000) {
      return; // Ignorer si on vient d'en logger un
    }
    this.log(EventType.LEVEL_UPDATE, LogLevel.DEBUG, `Level: ${level.toFixed(0)}dB`, { level: level.toFixed(0) });
  }

  recordThresholdChanged(oldThreshold, newThreshold) {
    this.log(EventType.THRESHOLD_CHANGED, LogLevel.INFO, `Threshold changed from ${oldThreshold}dB to ${newThreshold}dB`, {
      oldThreshold,
      newThreshold,
    });
  }

  recordForegroundServiceStart() {
    this.log(EventType.FOREGROUND_SERVICE_START, LogLevel.DEBUG, 'Foreground service started', {});
  }

  recordForegroundServiceStop() {
    this.log(EventType.FOREGROUND_SERVICE_STOP, LogLevel.DEBUG, 'Foreground service stopped', {});
  }

  recordForegroundServiceError(error) {
    this.log(EventType.FOREGROUND_SERVICE_START, LogLevel.WARN, 'Foreground service error', {
      error: error?.message,
    });
  }

  // ─── Gestion des listeners ───────────────────────────────────────────

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // ─── Export et nettoyage ─────────────────────────────────────────────

  async getLogs(filter = {}) {
    const {
      type,
      level,
      sessionId,
      limit,
      hours = 24,
    } = filter;

    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    let filtered = this.logs.filter(log => new Date(log.timestamp) >= cutoff);

    if (type) filtered = filtered.filter(log => log.type === type);
    if (level) filtered = filtered.filter(log => log.level === level);
    if (sessionId) filtered = filtered.filter(log => log.sessionId === sessionId);

    if (limit) filtered = filtered.slice(-limit);

    return filtered;
  }

  async getExport(hours = 24) {
    const logs = await this.getLogs({ hours });
    const analytics = await AsyncStorage.getItem(ANALYTICS_KEY);
    
    return {
      exportDate: new Date().toISOString(),
      sessionId: this.sessionId,
      hours,
      logCount: logs.length,
      logs,
      analytics: analytics ? JSON.parse(analytics) : {},
    };
  }

  async exportAsJson() {
    const data = await this.getExport();
    return JSON.stringify(data, null, 2);
  }

  async exportAsText(hours = 24) {
    const logs = await this.getLogs({ hours });
    let text = `=== SleepTalker Logs Export ===\n`;
    text += `Session: ${this.sessionId}\n`;
    text += `Export Time: ${new Date().toISOString()}\n`;
    text += `Total Logs: ${logs.length}\n\n`;
    
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      text += `[${time}] [${log.level}] [${log.type}] ${log.message}\n`;
      if (Object.keys(log.data).length > 0) {
        text += `  Data: ${JSON.stringify(log.data)}\n`;
      }
    });
    
    return text;
  }

  async clearLogs() {
    this.logs = [];
    await AsyncStorage.removeItem(LOG_KEY);
    this.info('Logs cleared', {});
  }

  async clearSession() {
    const filtered = this.logs.filter(log => log.sessionId !== this.sessionId);
    this.logs = filtered;
    this._persist();
    this.info('Current session logs cleared', {});
  }

  // ─── Statistiques ─────────────────────────────────────────────────────

  async getStats(hours = 24) {
    const logs = await this.getLogs({ hours });
    const analytics = await AsyncStorage.getItem(ANALYTICS_KEY);
    const analyticsData = analytics ? JSON.parse(analytics) : {};

    return {
      totalLogs: logs.length,
      errors: logs.filter(l => l.level === LogLevel.ERROR).length,
      warnings: logs.filter(l => l.level === LogLevel.WARN).length,
      soundDetected: logs.filter(l => l.type === EventType.SOUND_DETECTED).length,
      clipsRecorded: logs.filter(l => l.type === EventType.CAPTURE_SAVED).length,
      captureFailed: logs.filter(l => l.type === EventType.CAPTURE_FAILED).length,
      analytics: analyticsData,
    };
  }

  // ─── Privé ──────────────────────────────────────────────────────────

  async _persist() {
    try {
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('Logger persist error:', e);
    }
  }

  async _saveAnalytics(data) {
    try {
      await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Analytics save error:', e);
    }
  }

  async _updateAnalytics(updates) {
    try {
      const stored = await AsyncStorage.getItem(ANALYTICS_KEY);
      const current = stored ? JSON.parse(stored) : {};
      
      const updated = {
        ...current,
        clipsRecorded: (current.clipsRecorded || 0) + (updates.clipsRecorded || 0),
        totalRecordingTime: (current.totalRecordingTime || 0) + (updates.totalRecordingTime || 0),
        errors: (current.errors || 0) + (updates.errors || 0),
        lastSessionDate: new Date().toISOString(),
      };
      
      await this._saveAnalytics(updated);
    } catch (e) {
      console.error('Analytics update error:', e);
    }
  }
}

// Export singleton
const logger = new Logger();
export { logger, LogLevel, EventType };
export default logger;
