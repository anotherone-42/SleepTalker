# SleepTalker 🎙🌙

Application Android pour détecter et enregistrer les épisodes de somniloquie.  
**Fonctionne écran éteint** grâce à un Foreground Service Android natif.

## Fonctionnement

- Enregistrement continu par **chunks de 30 secondes**
- Si le niveau sonore dépasse le **seuil configurable** → chunk sauvegardé
- Sinon → supprimé automatiquement (zéro gaspillage d'espace)
- Une **notification persistante** maintient l'app active même écran éteint
- Clips horodatés, lisibles directement dans l'app

## Installation (bare workflow requis pour le Foreground Service)

### Prérequis
- Node.js 18+
- Android Studio + SDK (pour le build natif)
- Téléphone Android en mode développeur (USB debugging)

### Première fois

```bash
cd SleepTalker
npm install
npx expo prebuild --clean   # génère android/ natif
npx expo run:android        # compile + installe sur le téléphone USB
```

### Lancement suivants

```bash
npx expo run:android
```

### Build APK autonome (EAS cloud)

```bash
npx eas build -p android --profile preview
```

## 📋 Système de Logs

Un système de logging complet aide à diagnostiquer les problèmes d'enregistrement :

- ✅ Trace chaque événement (démarrage, détection, sauvegarde, erreurs)
- 📊 Affichage en temps réel dans MonitorScreen
- 💾 Persévérance automatique (1000 derniers logs)
- 📈 Statistiques et export JSON/texte

**Voir [LOGS_GUIDE.md](LOGS_GUIDE.md) pour les détails complets.**

---

## Réglages recommandés

| Situation | Seuil |
|-----------|-------|
| Chambre très silencieuse | -45 dBFS |
| Chambre normale | -35 dBFS (défaut) |
| Bruits de fond (ventilateur…) | -25 dBFS |

Place le téléphone sur la table de nuit, **micro vers le haut**, **branché au chargeur**.

## Architecture

```
index.js                        ← entry point bare workflow
App.js                          ← Navigation tabs + init logger
src/
  screens/
    MonitorScreen.js            ← UI + intégration ForegroundService + Logs display
    RecordingsScreen.js         ← Liste clips + lecture
  services/
    AudioMonitor.js             ← Enregistrement + détection dBFS + logging
    ForegroundService.js        ← Notification persistante Android + logging
    Logger.js                   ← 🆕 Système de logs centralisé
```

## Permissions Android

| Permission | Usage |
|---|---|
| RECORD_AUDIO | Microphone |
| FOREGROUND_SERVICE | Maintien actif |
| FOREGROUND_SERVICE_MICROPHONE | Android 14+ |
| WAKE_LOCK | CPU actif écran éteint |
| POST_NOTIFICATIONS | Notification barre de statut |
