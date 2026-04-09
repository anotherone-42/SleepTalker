import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';

import MonitorScreen from './src/screens/MonitorScreen';
import RecordingsScreen from './src/screens/RecordingsScreen';

const Tab = createBottomTabNavigator();

const C = {
  bg: '#070b14',
  surface: '#0e1623',
  border: '#1a2540',
  accent: '#4f9cf9',
  muted: '#4a5568',
  text: '#e8edf5',
};

export default function App() {
  // Trigger pour forcer le refresh de RecordingsScreen quand un clip est sauvegardé
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [maxRecordings, setMaxRecordings] = useState(10);

  const handleNewEvent = useCallback(() => {
    setRefreshTrigger(t => t + 1);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: C.accent,
            background: C.bg,
            card: C.surface,
            text: C.text,
            border: C.border,
            notification: C.accent,
          },
        }}
      >
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: C.surface,
              borderTopColor: C.border,
              height: 80,
              paddingBottom: 24,
              paddingTop: 8,
            },
            tabBarActiveTintColor: C.accent,
            tabBarInactiveTintColor: C.muted,
            tabBarLabelStyle: {
              fontSize: 11,
              letterSpacing: 0.5,
            },
          }}
        >
          <Tab.Screen
            name="Monitor"
            options={{
              tabBarLabel: 'Surveiller',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>🎙</Text>
              ),
            }}
          >
            {() => <MonitorScreen onNewEvent={handleNewEvent} maxRecordings={maxRecordings} onMaxRecordingsChange={setMaxRecordings} />}
          </Tab.Screen>

          <Tab.Screen
            name="Recordings"
            options={{
              tabBarLabel: 'Clips',
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>📁</Text>
              ),
            }}
          >
            {() => <RecordingsScreen refreshTrigger={refreshTrigger} maxRecordings={maxRecordings} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
