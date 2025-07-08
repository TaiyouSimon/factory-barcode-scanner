import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Camera, CameraView, BarcodeScanningResult } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const STORAGE_KEY = "@factory_scanner_directory";
const LAST_SCAN_KEY = "@factory_scanner_last_scan";

interface ScanResult {
  data: string;
  timestamp: number;
}

interface DirectoryPermission {
  granted: boolean;
  directoryUri: string;
}

export default function App() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [directoryPermission, setDirectoryPermission] =
    useState<DirectoryPermission | null>(null);
  const [pdfFiles, setPdfFiles] = useState<string[]>([]);
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);

  useEffect(() => {
    getCameraPermissions();
    loadSavedDirectory();
    loadLastScan();
  }, []);

  const toggleFlashlight = () => {
    setIsFlashlightOn((prev) => !prev);
  };

  const getCameraPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
  };

  const loadSavedDirectory = async () => {
    try {
      const savedDirectory = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedDirectory) {
        const directoryData = JSON.parse(savedDirectory) as DirectoryPermission;
        setDirectoryPermission(directoryData);
        if (directoryData.granted) {
          await loadPDFFilesFromDirectory(directoryData.directoryUri);
        }
      }
    } catch (error) {
      console.error("Error loading saved directory:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLastScan = async () => {
    try {
      const savedLastScan = await AsyncStorage.getItem(LAST_SCAN_KEY);
      if (savedLastScan) {
        setLastScan(JSON.parse(savedLastScan));
      }
    } catch (error) {
      console.error("Error loading last scan:", error);
    }
  };

  const saveLastScan = async (scanResult: ScanResult) => {
    try {
      await AsyncStorage.setItem(LAST_SCAN_KEY, JSON.stringify(scanResult));
    } catch (error) {
      console.error("Error saving last scan:", error);
    }
  };

  const requestDirectoryPermission = async () => {
    try {
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (permissions.granted) {
        setDirectoryPermission(permissions);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(permissions));
        await loadPDFFilesFromDirectory(permissions.directoryUri);
      } else {
        Alert.alert(
          "Permission Required",
          "Folder access is required to scan and open PDF files."
        );
      }
    } catch (error) {
      console.error("Error requesting directory permissions:", error);
      Alert.alert("Error", "Failed to request directory permissions.");
    }
  };

  const loadPDFFilesFromDirectory = async (directoryUri: string) => {
    try {
      setIsLoading(true);
      const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(
        directoryUri
      );

      const pdfFiles = files.filter((uri) =>
        uri.toLowerCase().endsWith(".pdf")
      );

      setPdfFiles(files);

      console.log(
        `Found ${pdfFiles.length} PDF files in the selected directory`
      );
    } catch (error) {
      console.error("Error loading PDF files from directory:", error);
      Alert.alert(
        "Error",
        "Failed to load PDF files from the selected directory."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getStringAfterLastSlash = (uri: string): string => {
    const lastSlashIndex = uri.lastIndexOf("%2F");
    if (lastSlashIndex !== -1) {
      return uri.substring(lastSlashIndex + 3);
    }
    return uri;
  };

  const openPDFWithIntent = async (uri: string) => {
    if (Platform.OS === "android") {
      try {
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: uri,
          type: "application/pdf",
          flags: 1,
        });
      } catch (error) {
        console.error("Error opening PDF with intent:", error);
        Alert.alert(
          "Error",
          "Could not open PDF. Please ensure you have Adobe Acrobat or another PDF app installed."
        );
      }
    }
  };

  const searchAndOpenPDF = async (barcode: string) => {
    if (!directoryPermission?.granted || pdfFiles.length === 0) {
      Alert.alert(
        "No PDFs Available",
        "Please select a folder with PDF files first."
      );
      return;
    }

    setIsProcessing(true);

    try {
      const matchingFiles = pdfFiles.filter((uri) => {
        const extractedBarcode = getStringAfterLastSlash(uri);
        return (
          extractedBarcode?.toLowerCase() === `${barcode.toLowerCase()}.pdf`
        );
      });

      if (matchingFiles.length > 0) {
        await openPDFWithIntent(matchingFiles[0]);
      } else {
        Alert.alert(
          "File Not Found",
          `No PDF found for barcode "${barcode}". Available files: ${pdfFiles.length}`,
          [
            {
              text: "Refresh Files",
              onPress: () =>
                directoryPermission &&
                loadPDFFilesFromDirectory(directoryPermission.directoryUri),
            },
            { text: "OK", style: "cancel" },
          ]
        );
      }
    } catch (error) {
      console.error("Error opening PDF:", error);
      Alert.alert("Error", "Failed to open PDF file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanned || isProcessing) return;

    if (data.length !== 14) {
      return;
    }
    setScanned(true);
    const scanResult = { data, timestamp: Date.now() };
    setLastScan(scanResult);
    saveLastScan(scanResult);

    let barcode = data.substring(0, 8);
    searchAndOpenPDF(barcode);

    setTimeout(() => {
      setScanned(false);
    }, 2000);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Requesting camera permission...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            This app needs camera access to scan barcodes for PDF lookup
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={getCameraPermissions}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!directoryPermission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={["#4F46E5", "#7C3AED"]}
          style={styles.setupContainer}
        >
          <View style={styles.setupContent}>
            <Ionicons name="folder-outline" size={80} color="#FFFFFF" />
            <Text style={styles.setupTitle}>Welcome to Factory Scanner</Text>
            <Text style={styles.setupText}>
              Select a folder containing your PDF files to get started. Files
              will be opened directly with Adobe Acrobat for editing.
            </Text>
            <Text style={styles.setupSubtext}>
              Name your PDF files with barcodes (e.g., "12345.pdf")
            </Text>
            <TouchableOpacity
              style={styles.setupButton}
              onPress={requestDirectoryPermission}
            >
              <Ionicons name="folder-open-outline" size={24} color="#4F46E5" />
              <Text style={styles.setupButtonText}>Select PDF Folder</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1F2937" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Factory Scanner</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              directoryPermission &&
              loadPDFFilesFromDirectory(directoryPermission.directoryUri)
            }
          >
            <Ionicons name="refresh-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={requestDirectoryPermission}
          >
            <Ionicons name="folder-open-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          enableTorch={isFlashlightOn}
          barcodeScannerSettings={{
            barcodeTypes: [
              "qr",
              "code128",
              "code39",
              "ean13",
              "ean8",
              "upc_a",
              "upc_e",
            ],
          }}
        >
          <View style={styles.scanningOverlay}>
            <View style={styles.scanningArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <Ionicons
                name="barcode-outline"
                size={220}
                color="white"
                style={styles.barcodeSkeleton}
              />
            </View>
            <Text style={styles.scanningText}>
              {isProcessing
                ? "Opening PDF..."
                : "Align barcode within the frame"}
            </Text>
          </View>

          {!isProcessing && (
            <TouchableOpacity
              style={styles.flashlightButton}
              onPress={toggleFlashlight}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isFlashlightOn ? "flashlight" : "flashlight-outline"}
                size={30}
                color={isFlashlightOn ? "#FBBF24" : "#FFFFFF"}
              />
            </TouchableOpacity>
          )}

          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.processingText}>
                Opening with Adobe Acrobat...
              </Text>
            </View>
          )}
        </CameraView>
      </View>

      <View style={styles.statusBar}>
        {lastScan && (
          <View style={styles.statusItem}>
            <Ionicons name="time-outline" size={20} color="#6B7280" />
            <Text style={styles.statusText}>
              Last: {lastScan.data} at {formatTimestamp(lastScan.timestamp)}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1F2937",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F9FAFB",
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
  },
  setupContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  setupContent: {
    padding: 32,
    alignItems: "center",
  },
  setupTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 24,
    marginBottom: 16,
    textAlign: "center",
  },
  setupText: {
    fontSize: 16,
    color: "#E5E7EB",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 24,
  },
  setupSubtext: {
    fontSize: 14,
    color: "#D1D5DB",
    textAlign: "center",
    marginBottom: 32,
    fontStyle: "italic",
  },
  setupButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  setupButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4F46E5",
    marginLeft: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1F2937",
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  headerActions: {
    flexDirection: "row",
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  cameraContainer: {
    flex: 1,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  scanningOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  scanningArea: {
    width: "85%",
    aspectRatio: 16 / 10,
    justifyContent: "center",
    alignItems: "center",
  },
  corner: {
    position: "absolute",
    width: 50,
    height: 50,
    borderColor: "#10B981",
    borderWidth: 6,
    borderRadius: 12,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  barcodeSkeleton: {
    position: "absolute",
    opacity: 0.1,
  },
  scanningText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginTop: 24,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  processingText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginTop: 16,
  },
  statusBar: {
    padding: 16,
    backgroundColor: "#374151",
    borderTopWidth: 1,
    borderTopColor: "#4B5563",
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  statusText: {
    color: "#E5E7EB",
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  button: {
    backgroundColor: "#4F46E5",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },

  flashlightButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
});
