import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

export default function AuthLoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
      <Text>Loading...</Text>
    </View>
  );
}