import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '@/theme';

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, sans-serif;
    background: #FAF6EC;
    padding: 24px 20px;
    color: #1F1A14;
  }
  h2 {
    font-size: 22px;
    font-weight: 700;
    color: #B0202C;
    margin-bottom: 6px;
    font-family: Georgia, serif;
  }
  p {
    font-size: 14px;
    color: #7A7164;
    margin-bottom: 28px;
    line-height: 1.5;
  }
  label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #7A7164;
    margin-bottom: 8px;
  }
  input[type="number"] {
    width: 100%;
    padding: 14px 16px;
    font-size: 24px;
    font-weight: 600;
    border: 1.5px solid #E5DDD0;
    border-radius: 10px;
    background: #fff;
    color: #1F1A14;
    margin-bottom: 28px;
    -webkit-appearance: none;
    appearance: none;
  }
  input[type="number"]:focus {
    outline: none;
    border-color: #B0202C;
  }
  .submit-wrap {
    text-align: center;
  }
  input[type="image"] {
    width: 220px;
    cursor: pointer;
  }
</style>
</head>
<body>
<h2>Support ChurchFlow</h2>
<p>Supporting free tech for South African churches</p>
<form name="PayFastPayNowForm" action="https://payment.payfast.io/eng/process" method="post">
  <input required type="hidden" name="cmd" value="_paynow">
  <input required type="hidden" name="receiver" value="18164611">
  <input type="hidden" name="return_url" value="https://www.churchflowonline.co.za">
  <input required type="hidden" name="item_name" value="Churchflow Donations">
  <input type="hidden" name="item_description" value="Supporting free tech for South African churches">
  <label for="PayFastAmount">Amount (ZAR)</label>
  <input required id="PayFastAmount" type="number" step=".01" name="amount" min="5.00" placeholder="5.00" value="100">
  <div class="submit-wrap">
    <input type="image" src="https://my.payfast.io/images/buttons/BuyNow/Primary-Large-BuyNow.png" alt="Donate with PayFast" title="Donate with PayFast">
  </div>
</form>
</body>
</html>`;

export function DonateScreen() {
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Donate</Text>
        <View style={styles.backBtn} />
      </View>
      <WebView
        ref={webViewRef}
        source={{ html: HTML }}
        style={styles.webView}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        originWhitelist={['*']}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 60 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '500' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  webView: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
