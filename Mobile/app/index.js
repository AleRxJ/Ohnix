import { useCallback, useRef, useState } from "react";
import { BackHandler, StyleSheet, View, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";

// Mobile's actual "shared code" with Web isn't a code import - antd (every
// button/input/table/modal on ohnix.co) is a react-dom library and has no
// React Native equivalent, so there is no way to reuse those components
// natively (see docs/architecture/ohnix-multiplatform-strategy.md §7-8).
// What this screen shares instead is the deployed site itself: loading the
// real ohnix.co inside a native WebView means the UI is always pixel-identical
// to Web, with zero screens to hand-build or keep in sync - the tradeoff
// (spelled out to the user before switching to this approach) is that this
// isn't a "native-feel" app - scrolling/transitions are the browser's, not
// a native navigator's, and phone-hardware features (camera, push) need
// their own bridge work later if the deliberately-narrow Fase D scope (§12:
// quick search, barcode scan, quick sale, notifications) ends up wanting
// them from the app shell rather than the website's own browser APIs.
const OHNIX_URL = "https://ohnix.co/login";

export default function Index() {
    const webviewRef = useRef(null);
    const canGoBackRef = useRef(false);
    const [loading, setLoading] = useState(true);

    // Android's hardware back button should step back through the site's
    // own history (e.g. dashboard -> products) before it's allowed to leave
    // the app, exactly like Chrome custom tabs behave - without this it
    // closes the whole app from the very first screen.
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                if (canGoBackRef.current && webviewRef.current) {
                    webviewRef.current.goBack();
                    return true;
                }
                return false;
            };
            const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
            return () => subscription.remove();
        }, [])
    );

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <WebView
                ref={webviewRef}
                source={{ uri: OHNIX_URL }}
                style={styles.webview}
                onNavigationStateChange={(navState) => {
                    canGoBackRef.current = navState.canGoBack;
                }}
                onLoadEnd={() => setLoading(false)}
                domStorageEnabled
                sharedCookiesEnabled
                startInLoadingState={false}
            />
            {loading ? (
                <View style={styles.loadingOverlay} pointerEvents="none">
                    <ActivityIndicator color="#29D8D5" size="large" />
                </View>
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#050505" },
    webview: { flex: 1, backgroundColor: "#050505" },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#050505",
    },
});
