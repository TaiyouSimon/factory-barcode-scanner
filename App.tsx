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
  ScrollView,
} from "react-native";
import { Camera, CameraView, BarcodeScanningResult } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const STORAGE_KEY = "@factory_scanner_pdfs";

interface ScanResult {
  data: string;
  timestamp: number;
}

interface PDFFile {
  name: string;
  uri: string;
  size: number;
  barcode: string;
}

export default function App() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<PDFFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    getCameraPermissions();
    loadPDFFiles();
  }, []);

  const getCameraPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === "granted");
  };

  const loadPDFFiles = async () => {
    try {
      const savedFiles = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedFiles) {
        const files = JSON.parse(savedFiles) as PDFFile[];

        const validFiles = [];
        for (const file of files) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(file.uri);
            if (fileInfo.exists) {
              validFiles.push(file);
            }
          } catch (error) {
            console.log(`File no longer accessible: ${file.name}`);
          }
        }
        setPdfFiles(validFiles);

        if (validFiles.length !== files.length) {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(validFiles));
        }
      }
    } catch (error) {
      console.error("Error loading PDF files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const addPDFFiles = async () => {
    setIsManaging(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: true,
        copyToCacheDirectory: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        const existingUris = new Set(pdfFiles.map((file) => file.uri));

        const newFiles: PDFFile[] = [];
        let duplicateCount = 0;
        let invalidCount = 0;

        for (const asset of result.assets) {
          if (existingUris.has(asset.uri)) {
            duplicateCount++;
            continue;
          }

          const fileName = asset.name || "unknown.pdf";
          const barcode = extractBarcodeFromFilename(fileName);

          if (barcode) {
            newFiles.push({
              name: fileName,
              uri: asset.uri,
              size: asset.size || 0,
              barcode: barcode,
            });
          } else {
            invalidCount++;
          }
        }

        if (newFiles.length > 0) {
          const updatedFiles = [...pdfFiles, ...newFiles];
          setPdfFiles(updatedFiles);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFiles));

          let alertMessage = `Added ${newFiles.length} new PDF file(s) successfully!`;
          if (duplicateCount > 0) {
            alertMessage += `\n${duplicateCount} duplicate(s) were ignored.`;
          }
          if (invalidCount > 0) {
            alertMessage += `\n${invalidCount} file(s) with invalid names were ignored.`;
          }
          Alert.alert("Files Added", alertMessage, [{ text: "OK" }]);
        } else {
          let alertMessage = "No new valid files were added.";
          if (duplicateCount > 0) {
            alertMessage = `${duplicateCount} selected file(s) were already in the list.`;
          } else if (invalidCount > 0) {
            alertMessage =
              'The selected file(s) did not have valid barcode names (e.g., "12345.pdf").';
          }
          Alert.alert("No Files Added", alertMessage, [{ text: "OK" }]);
        }
      }
    } catch (error) {
      console.error("Error adding PDFs:", error);
      Alert.alert("Error", "Failed to add PDF files. Please try again.");
    } finally {
      setIsManaging(false);
    }
  };

  const extractBarcodeFromFilename = (filename: string): string | null => {
    const nameWithoutExt = filename.replace(/\.pdf$/i, "");
    if (/^[a-zA-Z0-9]+$/.test(nameWithoutExt)) {
      return nameWithoutExt;
    }
    return null;
  };

  const removePDFFile = async (uri: string) => {
    try {
      const updatedFiles = pdfFiles.filter((file) => file.uri !== uri);
      if (updatedFiles.length === 0) {
        setIsManaging(!isManaging);
      }
      setPdfFiles(updatedFiles);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFiles));
    } catch (error) {
      console.error("Error removing PDF file:", error);
    }
  };

  const openPDFWithIntent = async (uri: string, filename: string) => {
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
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: "application/pdf",
          copyToCacheDirectory: false,
        });

        if (result.canceled === true) {
          Alert.alert(
            "Open PDF",
            "Please use the share button to open with your preferred PDF app.",
            [{ text: "OK" }]
          );
        }
      } catch (error) {
        console.error("Error opening PDF on iOS:", error);
        Alert.alert("Error", "Could not open PDF file.");
      }
    }
  };

  const searchAndOpenPDF = async (barcode: string) => {
    if (pdfFiles.length === 0) {
      Alert.alert("No PDFs Available", "Please add PDF files first.");
      return;
    }

    setIsProcessing(true);

    try {
      const matchingFile = pdfFiles.find(
        (file) => file.barcode.toLowerCase() === barcode.toLowerCase()
      );

      if (matchingFile) {
        const fileInfo = await FileSystem.getInfoAsync(matchingFile.uri);
        if (fileInfo.exists) {
          await openPDFWithIntent(matchingFile.uri, matchingFile.name);
        } else {
          Alert.alert(
            "File Not Found",
            `PDF file "${matchingFile.name}" is no longer available. Please re-add it.`,
            [
              {
                text: "Remove from List",
                onPress: () => removePDFFile(matchingFile.uri),
              },
              { text: "Cancel", style: "cancel" },
            ]
          );
        }
      } else {
        Alert.alert(
          "File Not Found",
          `No PDF found for barcode "${barcode}". Available files: ${pdfFiles.length}`,
          [
            { text: "Add Files", onPress: addPDFFiles },
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
    setLastScan({ data, timestamp: Date.now() });

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

  if (pdfFiles.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={["#4F46E5", "#7C3AED"]}
          style={styles.setupContainer}
        >
          <View style={styles.setupContent}>
            <Ionicons name="document-outline" size={80} color="#FFFFFF" />
            <Text style={styles.setupTitle}>Welcome to Factory Scanner</Text>
            <Text style={styles.setupText}>
              Add your PDF files to get started. Files will be opened directly
              with Adobe Acrobat for editing.
            </Text>
            <Text style={styles.setupSubtext}>
              Name your PDF files with barcodes (e.g., "12345.pdf")
            </Text>
            {isManaging && (
              <View style={styles.importingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.importingText}>Adding files...</Text>
              </View>
            )}
            {!isManaging && (
              <TouchableOpacity
                style={styles.setupButton}
                onPress={addPDFFiles}
              >
                <Ionicons name="add-outline" size={24} color="#4F46E5" />
                <Text style={styles.setupButtonText}>Add PDF Files</Text>
              </TouchableOpacity>
            )}
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
            onPress={() => setIsManaging(!isManaging)}
          >
            <Ionicons name="list-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={addPDFFiles}>
            <Ionicons name="add-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {isManaging && (
        <View style={styles.fileManager}>
          <Text style={styles.fileManagerTitle}>
            Manage PDF Files ({pdfFiles.length})
          </Text>
          <ScrollView style={styles.fileList}>
            {pdfFiles.map((file, index) => (
              <View key={index} style={styles.fileItem}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>{file.name}</Text>
                  <Text style={styles.fileBarcode}>
                    Barcode: {file.barcode}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removePDFFile(file.uri)}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {!isManaging && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
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
                <View style={styles.scanningBorder} />
                <Text style={styles.scanningText}>
                  {isProcessing
                    ? "Opening PDF..."
                    : "Align barcode within the frame"}
                </Text>
              </View>
            </View>

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
      )}

      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Ionicons name="documents-outline" size={20} color="#10B981" />
          <Text style={styles.statusText}>
            PDFs Available: {pdfFiles.length}
          </Text>
        </View>

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
  importingContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  importingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 16,
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
    padding: 16,
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
  fileManager: {
    backgroundColor: "#374151",
    maxHeight: 300,
  },
  fileManagerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    padding: 16,
    paddingBottom: 8,
  },
  fileList: {
    paddingHorizontal: 16,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#4B5563",
    borderRadius: 8,
    marginBottom: 8,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  fileBarcode: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  removeButton: {
    padding: 8,
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
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  scanningArea: {
    width: 500,
    height: 280,
    justifyContent: "center",
    alignItems: "center",
  },
  scanningBorder: {
    width: 500,
    height: 200,
    borderWidth: 2,
    borderColor: "#10B981",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  scanningText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginTop: 24,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
});
