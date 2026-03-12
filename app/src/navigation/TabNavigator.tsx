import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import PublishedGalleryScreen from '../screens/PublishedGalleryScreen';
import DeviceGalleryScreen from '../screens/DeviceGalleryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { GalleryStackParamList, TabParamList, RootStackParamList } from './types';

// 仕様書 §3.2 画面構成

const GalleryStack = createNativeStackNavigator<GalleryStackParamList>();

function PublishedGalleryStack() {
  return (
    <GalleryStack.Navigator>
      <GalleryStack.Screen
        name="Gallery"
        component={PublishedGalleryScreen}
        options={({ navigation }) => ({
          title: 'RootLens',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={24} color="#1a1a1a" />
            </TouchableOpacity>
          ),
        })}
      />
      <GalleryStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: '設定' }}
      />
    </GalleryStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabParamList>();

// 空のプレースホルダー（カメラタブは実際にはモーダルを開く）
function CameraPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}

// 中央カメラボタン（§3.2: 丸いカメラボタン）
function CameraTabButton({ onPress }: { onPress?: (...args: any[]) => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity
      style={styles.cameraButtonOuter}
      onPress={() => navigation.navigate('Camera')}
    >
      <View style={styles.cameraButton}>
        <View style={styles.cameraButtonInner} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#bbb',
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="PublishedTab"
        component={PublishedGalleryStack}
        options={{
          tabBarLabel: 'ホーム',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CameraTab"
        component={CameraPlaceholder}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => null,
          tabBarButton: (props) => <CameraTabButton />,
        }}
      />
      <Tab.Screen
        name="DeviceGalleryTab"
        component={DeviceGalleryScreen}
        options={{
          tabBarLabel: 'ギャラリー',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'images' : 'images-outline'} size={size} color={color} />
          ),
          headerShown: true,
          headerTitle: 'ギャラリー',
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 88,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  cameraButtonOuter: {
    top: -16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  cameraButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
});
