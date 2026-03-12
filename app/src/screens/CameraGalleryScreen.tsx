import React from 'react';
import { useNavigation } from '@react-navigation/native';
import GalleryView from '../components/GalleryView';

// 仕様書 §3.5 コンテンツ選択（カメラサムネからのアクセス）
export default function CameraGalleryScreen() {
  const navigation = useNavigation();
  return <GalleryView onClose={() => navigation.goBack()} />;
}
