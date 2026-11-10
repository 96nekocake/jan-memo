import { StatusBar, StyleSheet, View } from 'react-native';

import COLORS from './colors.json';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
