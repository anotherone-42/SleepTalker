/**
 * ForegroundService.js
 *
 * Wrapper autour de @supersami/rn-foreground-service.
 * Affiche une notification persistante quand la surveillance est active,
 * ce qui empêche Android de tuer l'app écran éteint.
 *
 * Android 14+ exige foregroundServiceType = "microphone" (déclaré dans app.json).
 */

import ForegroundService from '@supersami/rn-foreground-service';

const TASK_ID = 'sleeptalker-monitor';
const CHANNEL_ID = 'sleeptalker-channel';
const CHANNEL_NAME = 'SleepTalker Surveillance';

let _started = false;

export async function startForegroundService() {
  if (_started) return;
  try {
    await ForegroundService.startService({
      taskName: TASK_ID,
      channelId: CHANNEL_ID,
      channelName: CHANNEL_NAME,
      channelDescription: 'Surveillance du micro pendant le sommeil',
      channelImportance: 2, // IMPORTANCE_LOW — pas de son
      notificationTitle: '🎙 SleepTalker actif',
      notificationText: 'Surveillance du micro en cours…',
      notificationImportance: 'low',
      icon: 'ic_notification', // icône système de secours si pas d'asset custom
      foregroundServiceType: 'microphone', // Android 14+
    });
    _started = true;
  } catch (e) {
    console.warn('ForegroundService start error:', e);
  }
}

export async function updateForegroundNotification(eventCount) {
  if (!_started) return;
  try {
    await ForegroundService.updateService({
      taskName: TASK_ID,
      channelId: CHANNEL_ID,
      channelName: CHANNEL_NAME,
      notificationTitle: '🎙 SleepTalker actif',
      notificationText: eventCount === 0
        ? 'Surveillance en cours — aucun son détecté'
        : `${eventCount} clip${eventCount > 1 ? 's' : ''} enregistré${eventCount > 1 ? 's' : ''} ce soir`,
      notificationImportance: 'low',
    });
  } catch (e) {
    // Non bloquant
  }
}

export async function stopForegroundService() {
  if (!_started) return;
  try {
    await ForegroundService.stopService(TASK_ID);
    _started = false;
  } catch (e) {
    console.warn('ForegroundService stop error:', e);
  }
}
