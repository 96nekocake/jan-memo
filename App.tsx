import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import COLORS from './colors.json';
import { ScanSession } from './scanSession';

type Notice = 'added' | 'duplicate';

function ScannerScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [session] = useState(() => new ScanSession());
  const [codes, setCodes] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [permissionError, setPermissionError] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state === 'active') {
        void getPermission().catch(() => setPermissionError(true));
      } else {
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
        setNotice(null);
        Vibration.cancel();
      }
    });
    return () => {
      subscription.remove();
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
      Vibration.cancel();
    };
  }, [getPermission]);

  const handleScan = useCallback(({ data }: BarcodeScanningResult) => {
    if (AppState.currentState !== 'active') return;
    const result = session.scan(data);
    if (result.status !== 'added' && result.status !== 'duplicate') return;

    setCodes(result.codes);
    setNotice(result.status);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 1500);

    Vibration.cancel();
    if (result.status === 'added') {
      Vibration.vibrate(50);
    } else {
      // iOSは1回の振動時間を指定できないため、重複時は2回振動させる。
      Vibration.vibrate(Platform.OS === 'ios' ? [0, 600] : 400);
    }
  }, [session]);

  async function allowCamera() {
    setPermissionError(false);
    try {
      if (permission?.canAskAgain) {
        await requestPermission();
      } else {
        await Linking.openSettings();
      }
    } catch {
      setPermissionError(true);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.secondaryText}>カメラの許可を確認中</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>カメラの許可</Text>
        <Text style={styles.text}>JANコードの読み取りにカメラを使用します。</Text>
        <Pressable style={styles.button} onPress={allowCamera} accessibilityRole="button">
          <Text style={styles.buttonText}>
            {permission.canAskAgain ? 'カメラを許可' : '設定を開く'}
          </Text>
        </Pressable>
        {permissionError && <Text style={styles.text}>カメラの許可を確認できません</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.layout, width > height && styles.landscape]}>
        <View style={styles.cameraRegion}>
          {cameraError ? (
            <View style={styles.center}>
              <Text style={styles.text}>カメラを起動できません</Text>
              <Pressable
                style={styles.button}
                onPress={() => setCameraError(false)}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>再試行</Text>
              </Pressable>
            </View>
          ) : active ? (
            <CameraView
              style={styles.container}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8'] }}
              onBarcodeScanned={handleScan}
              onMountError={() => setCameraError(true)}
            />
          ) : null}
        </View>
        <View style={styles.listRegion}>
          <Text style={styles.count}>{codes.length}件</Text>
          <FlatList
            data={codes}
            keyExtractor={(code) => code}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.secondaryText}>コードはありません</Text>}
            renderItem={({ item }) => <Text style={styles.code}>{item}</Text>}
          />
          {notice && (
            <View
              style={[styles.notice, {
                backgroundColor: notice === 'added' ? COLORS.added : COLORS.duplicate,
              }]}
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.text}>
                {notice === 'added' ? '追加しました' : 'すでに登録済み'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <ScannerScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  layout: { flex: 1 },
  landscape: { flexDirection: 'row' },
  cameraRegion: { flex: 1, overflow: 'hidden' },
  listRegion: { flex: 2, minWidth: 0 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 16,
    backgroundColor: COLORS.background,
  },
  title: { fontSize: 20, color: COLORS.text },
  text: { fontSize: 16, color: COLORS.text },
  secondaryText: { fontSize: 16, color: COLORS.secondaryText },
  count: { padding: 12, fontSize: 16, color: COLORS.secondaryText },
  listContent: { paddingHorizontal: 12, paddingBottom: 72 },
  code: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontSize: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: { padding: 12, backgroundColor: COLORS.text },
  buttonText: { fontSize: 16, color: COLORS.background },
  notice: { position: 'absolute', bottom: 12, left: 12, right: 12, padding: 16 },
});
