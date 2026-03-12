import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// 仕様書 §3.8 設定画面

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="settings-outline" size={56} color="#ccc" />
      <Text style={styles.text}>設定（準備中）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: 16,
    color: '#999',
  },
});
