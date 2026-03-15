import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Switch,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../hooks/useAuth';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography, spacing, radii } from '../theme';
import { t } from '../i18n';
import { loadCameraSettings, saveCameraSettings, type CameraSettings } from '../store/cameraSettings';
import { loadProfile, saveProfile, shortenAddress, type Profile } from '../store/profileStore';

// 仕様書 §3.8 設定画面

export default function SettingsScreen() {
  const { logout, solanaAddress } = useAuth();
  const [camSettings, setCamSettings] = useState<CameraSettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadCameraSettings().then(setCamSettings);
      loadProfile().then(setProfile);
    }, []),
  );

  const updateCam = (key: keyof CameraSettings, value: boolean) => {
    if (!camSettings) return;
    const next = { ...camSettings, [key]: value };
    setCamSettings(next);
    saveCameraSettings(next);
  };

  const updateProfile = (key: keyof Profile, value: string | boolean) => {
    if (!profile) return;
    const next = { ...profile, [key]: value };
    setProfile(next);
    setProfileDirty(true);
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    try {
      await saveProfile(profile);
      setProfileDirty(false);
      Keyboard.dismiss();
    } catch (e) {
      console.warn('Profile save error:', e);
    }
  };

  if (!camSettings || !profile) return <View style={styles.container} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* プロフィール */}
      <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>
      <View style={styles.section}>
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>{t('settings.displayName')}</Text>
          <TextInput
            style={styles.input}
            value={profile.displayName}
            onChangeText={(v) => updateProfile('displayName', v)}
            placeholder={t('settings.displayNamePlaceholder')}
            placeholderTextColor={colors.textDisabled}
            returnKeyType="done"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Solana アドレス</Text>
          <Text style={styles.addressValue} numberOfLines={1}>
            {(solanaAddress || profile.address) ? shortenAddress(solanaAddress || profile.address) : '—'}
          </Text>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => { const addr = solanaAddress || profile.address; if (addr) Clipboard.setStringAsync(addr); }}
            disabled={!(solanaAddress || profile.address)}
          >
            <Ionicons name="copy-outline" size={16} color={(solanaAddress || profile.address) ? colors.textSecondary : colors.textDisabled} />
          </TouchableOpacity>
        </View>
        <View style={styles.divider} />
        <ToggleRow
          label={t('settings.showDeviceName')}
          value={profile.showDeviceName}
          onToggle={(v) => updateProfile('showDeviceName' as any, v as any)}
        />
        <View style={styles.divider} />
        <View style={styles.inputRowVertical}>
          <Text style={styles.inputLabel}>{t('settings.bio')}</Text>
          <TextInput
            style={styles.bioInput}
            value={profile.bio}
            onChangeText={(v) => updateProfile('bio', v)}
            placeholder={t('settings.bioPlaceholder')}
            placeholderTextColor={colors.textDisabled}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>

      {profileDirty && (
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
          <Text style={styles.saveButtonText}>{t('settings.profileSave')}</Text>
        </TouchableOpacity>
      )}

      {/* カメラ */}
      <Text style={styles.sectionTitle}>{t('settings.camera')}</Text>
      <View style={styles.section}>
        <ToggleRow
          label={t('settings.grid')}
          description={t('settings.gridDesc')}
          value={camSettings.grid}
          onToggle={(v) => updateCam('grid', v)}
        />
        <View style={styles.divider} />
        <ToggleRow
          label={t('settings.shutterSound')}
          value={camSettings.shutterSound}
          onToggle={(v) => updateCam('shutterSound', v)}
        />
      </View>

      {/* アプリ情報 */}
      <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.version')}</Text>
          <Text style={styles.rowValue}>0.1.0</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.deviceLabel')}</Text>
          <Text style={styles.rowValue}>{profile.deviceName}</Text>
        </View>
      </View>

      {/* ログアウト */}
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>{t('settings.logout')}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTextArea}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description && <Text style={styles.rowDesc}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.surfaceAlt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textHint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  section: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  rowTextArea: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowDesc: {
    ...typography.caption,
    color: colors.textHint,
    marginTop: 2,
  },
  rowValue: {
    ...typography.body,
    color: colors.textHint,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg,
  },
  // プロフィール入力
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  inputRowVertical: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'right',
    padding: 0,
  },
  bioInput: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    minHeight: 72,
  },
  addressValue: {
    flex: 1,
    ...typography.caption,
    color: colors.textHint,
    fontFamily: 'Menlo',
    fontSize: 11,
    textAlign: 'right',
  },
  copyBtn: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  logoutButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  logoutText: {
    ...typography.body,
    color: colors.error,
  },
  saveButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.white,
    ...typography.bodyMedium,
  },
});
