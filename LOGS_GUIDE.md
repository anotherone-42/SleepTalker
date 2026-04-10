# 📋 Système de Logs SleepTalker

## Vue d'ensemble

Un système de logging complet a été ajouté à SleepTalker pour vous aider à diagnostiquer et déboguer les problèmes d'enregistrement.

## Fonctionnalités

### ✅ Événements tracés

Le système enregistre tous les événements importants :

- **Démarrage/Arrêt**
  - `MONITOR_START` : Démarrage de la surveillance
  - `MONITOR_STOP` : Arrêt de la surveillance
  
- **Permissions**
  - `PERMISSION_REQUESTED` : Demande d'autorisation micro
  - `PERMISSION_GRANTED` : Autorisation accordée
  - `PERMISSION_DENIED` : Autorisation refusée
  
- **Enregistrement Audio**
  - `RECORDING_STARTED` : Enregistrement initialisé
  - `SOUND_DETECTED` : Son détecté (avec niveau dBFS)
  - `CAPTURE_STARTED` : Passage en mode capture
  - `SILENCE_DETECTED` : Silence détecté
  - `CAPTURE_SAVED` : Clip sauvegardé avec durée
  - `CAPTURE_FAILED` : Erreur lors de la sauvegarde
  
- **Erreurs**
  - Tous les erreurs sont enregistrées avec détails
  - Les avertissements et informations sont aussi tracés

### 📊 Affichage en temps réel

Dans `MonitorScreen`, une section **Logs** affiche les 10 derniers événements :
- ⏱️ Heure précise
- 🏷️ Type d'événement
- 💬 Message
- Color-coded par niveau (INFO=vert, WARN=jaune, ERROR=rouge)

Cliquez sur le header "📋 Logs" pour développer/réduire la section.

### 💾 Persévérance

- Les logs sont enregistrés dans AsyncStorage
- Jusqu'à 1000 événements sont conservés
- Persévérance automatique - aucune action requise

### 📈 Statistiques

Fonction `getStats()` disponible pour achever :
- Nombre total de logs
- Erreurs/Avertissements
- Sons détectés
- Clips enregistrés/échoués

### 🔄 Abonnement aux logs

Code pour tracker les logs en temps réel dans vos composants :

```javascript
import logger from '../services/Logger';

useEffect(() => {
  const unsubscribe = logger.subscribe((logEntry) => {
    console.log('New log:', logEntry);
  });
  
  return () => unsubscribe();
}, []);
```

## Diagnostic des problèmes

### ❌ Pas d'enregistrement la nuit

Vérifiez les logs pour :

1. **`PERMISSION_DENIED`** → Donnez les permissions au micro
2. **`RECORDING_ERROR`** → Problème matériel/capteur
3. **Pas de `SOUND_DETECTED`** → Seuil trop haut, essayez -50 ou -40 dBFS
4. **`CAPTURE_FAILED`** → Problème d'espace disque

### 🔧 Exemple de débogage

Si pas de clip après une nuit :
1. Ouvrez l'app et regardez les logs
2. Cherchez les patterns :
   - Son était-il détecté ? → Voir `SOUND_DETECTED`
   - Capture initiée ? → Voir `CAPTURE_STARTED`
   - Erreur de sauvegarde ? → Voir `CAPTURE_FAILED`

## API Complète

```javascript
// Récupérer les logs
const logs = await logger.getLogs({ 
  type: 'SOUND_DETECTED',
  level: 'ERROR',
  hours: 24,
  limit: 50
});

// Export complet
const json = await logger.exportAsJson();
const text = await logger.exportAsText();

// Statistiques
const stats = await logger.getStats(24); // 24 heures

// Nettoyer
await logger.clearLogs();
```

## Niveaux de log

- **DEBUG** : Infos très détaillées
- **INFO** : Événements normaux
- **WARN** : Avertissements non-bloquants
- **ERROR** : Erreurs

## Conseil de diagnostic

La meilleure façon de déboguer un problème d'enregistrement :

1. Démarrez la surveillance (à travers l'app)
2. Cherchez manuellement une source de son (parlez, touchez le micro)
3. Vérifiez dans les logs si le son a été détecté
4. Observez la séquence d'événements dans les logs
5. Si une erreur apparaît, notez le message et la durée

Les logs vous diront exactement où le processus s'arrête.

---

**Session ID** : Un ID unique est généré à chaque lancement de l'app pour tracker une session complète.
