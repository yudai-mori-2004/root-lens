import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TabNavigator from './src/navigation/TabNavigator';
import CameraScreen from './src/screens/CameraScreen';
import CameraGalleryScreen from './src/screens/CameraGalleryScreen';
import EditScreen from './src/screens/EditScreen';
import PublishingScreen from './src/screens/PublishingScreen';
import PreviewScreen from './src/screens/PreviewScreen';
import RegistrationScreen from './src/screens/RegistrationScreen';
import type { RootStackParamList } from './src/navigation/types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      <RootStack.Navigator>
        <RootStack.Screen
          name="Main"
          component={TabNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen
          name="Camera"
          component={CameraScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <RootStack.Screen
          name="CameraGallery"
          component={CameraGalleryScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <RootStack.Screen
          name="Edit"
          component={EditScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <RootStack.Screen
          name="Publishing"
          component={PublishingScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        <RootStack.Screen
          name="Preview"
          component={PreviewScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <RootStack.Screen
          name="Registration"
          component={RegistrationScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
      </RootStack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
    </SafeAreaProvider>
  );
}
