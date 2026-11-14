import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Linking,
  Modal,
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
import { CodeStorage } from './codeStorage';
import { ScanSession } from './scanSession';

type Notice = 'added' | 'duplicate';

function ScannerScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [storage] = useState(() => new CodeStorage(AsyncStorage));
  const session = useRef<ScanSession | null>(null);
  const [codes, setCodes] = useState<readonly string[]>([]);
  const latestCodes = useRef<readonly string[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const saveRevision = useRef(0);
  const mounted = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [permissionError, setPermissionError] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmingClear = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    void storage.load().then((restored) => {
      if (cancelled) return;
      session.current = new ScanSession(restored);
      latestCodes.current = restored;
      setCodes(restored);
      setLoadState('ready');
    }).catch(() => {
      if (!cancelled) setLoadState('error');
    });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [storage, loadAttempt]);

  const persistCodes = useCallback((next: readonly string[]) => {
    latestCodes.current = next;
    setCodes(next);
    const revision = ++saveRevision.current;
    void storage.save(next).then(() => {
      if (mounted.current && revision === saveRevision.current) setSaveError(false);
    }, () => {
      if (mounted.current && revision === saveRevision.current) setSaveError(true);
    });
  }, [storage]);

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
    if (AppState.currentState !== 'active' || confirmingClear.current) return;
    if (!session.current) return;
    const result = session.current.scan(data);
    if (result.status !== 'added' && result.status !== 'duplicate') return;

    if (result.status === 'added') persistCodes(result.codes);
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
  }, [persistCodes]);

  function clearFeedback() {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    setNotice(null);
    Vibration.cancel();
  }

  function removeCode(code: string) {
    if (!session.current) return;
    persistCodes(session.current.remove(code));
    clearFeedback();
  }

  function requestClear() {
    if (codes.length === 0 || confirmingClear.current) return;
    confirmingClear.current = true;
    setConfirmClear(true);
    clearFeedback();
  }

  function dismissClear() {
    confirmingClear.current = false;
    setConfirmClear(false);
  }

  function clearCodes() {
    if (!session.current) return;
    persistCodes(session.current.clear());
    dismissClear();
  }

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

  if (loadState !== 'ready') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.secondaryText}>
          {loadState === 'loading' ? '一覧を読み込み中' : '保存した一覧を読み込めません'}
        </Text>
        {loadState === 'error' && (
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            onPress={() => {
              setLoadState('loading');
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            <Text style={styles.buttonText}>再試行</Text>
          </Pressable>
        )}
      </SafeAreaView>
    );
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
          {saveError && (
            <View style={styles.storageError} accessibilityLiveRegion="polite">
              <Text style={styles.text}>一覧を保存できません</Text>
              <Pressable
                style={styles.button}
                accessibilityRole="button"
                onPress={() => persistCodes(latestCodes.current)}
              >
                <Text style={styles.buttonText}>再試行</Text>
              </Pressable>
            </View>
          )}
          <FlatList
            data={codes}
            keyExtractor={(code) => code}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.secondaryText}>コードはありません</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.code}>{item}</Text>
                <Pressable
                  style={styles.removeButton}
                  onPress={() => removeCode(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item + 'を削除'}
                >
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            )}
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.clearButton, codes.length === 0 && styles.disabled]}
              onPress={requestClear}
              disabled={codes.length === 0}
              accessibilityRole="button"
            >
              <Text style={styles.text}>全消去</Text>
            </Pressable>
          </View>
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
      <Modal
        visible={confirmClear}
        transparent
        animationType="none"
        onRequestClose={dismissClear}
      >
        <SafeAreaView style={styles.confirmationBackdrop}>
          <View style={styles.confirmationCard} accessibilityViewIsModal>
            <Text style={styles.title} accessibilityRole="header">全消去</Text>
            <Text style={styles.text}>すべてのコードを削除しますか？</Text>
            <View style={styles.confirmationActions}>
              <Pressable style={styles.button} onPress={dismissClear} accessibilityRole="button">
                <Text style={styles.buttonText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.clearButton]}
                onPress={clearCodes}
                accessibilityRole="button"
              >
                <Text style={styles.text}>全消去</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: 8,
  },
  code: {
    flex: 1,
    padding: 12,
    color: COLORS.text,
    fontSize: 24,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: { padding: 12, backgroundColor: COLORS.text },
  buttonText: { fontSize: 16, color: COLORS.background },
  removeButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 24, color: COLORS.destructive },
  actions: { padding: 12 },
  storageError: { marginHorizontal: 12, marginBottom: 12, padding: 12, gap: 8, backgroundColor: COLORS.surface },
  clearButton: { backgroundColor: COLORS.destructive, alignItems: 'center' },
  disabled: { backgroundColor: COLORS.surface },
  notice: { position: 'absolute', bottom: 76, left: 12, right: 12, padding: 16 },
  confirmationBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
  },
  confirmationCard: { maxWidth: 360, padding: 20, gap: 20, backgroundColor: COLORS.surface },
  confirmationActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12 },
});
