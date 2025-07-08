# Factory Barcode Scanner

This is a React Native application for scanning barcodes in a factory setting. The app allows users to select a folder containing PDF files named with barcodes (e.g., "12345.pdf"). When a barcode is scanned, the app automatically finds and opens the corresponding PDF file for editing.

## Features

- **Persistent Folder Access**: Select a folder once, and the app remembers it across sessions
- **Barcode Scanning**: Scan barcodes to quickly find and open PDF files
- **Direct PDF Editing**: Opens PDFs with the device's default PDF viewer (e.g., Adobe Acrobat)
- **Automatic File Discovery**: Automatically finds all PDF files in the selected folder

## Setup Instructions

To set up and run this project locally, follow these steps:

1.  **Install Dependencies**:

    ```bash
    npm install
    # or yarn install
    ```

2.  **Start the Development Server**:

    ```bash
    npm start
    # or yarn start
    ```

3.  **Run on Android Device/Emulator**:
    ```bash
    npm run android
    # or yarn android
    ```

## How to Use

1. **First-time Setup**: When you first open the app, you'll be prompted to select a folder containing your PDF files.
2. **Select Folder**: Tap "Select PDF Folder" and choose the folder where your PDF files are stored.
3. **Scan Barcodes**: Once a folder is selected, the app will show the camera view. Scan a barcode to find and open the corresponding PDF.
4. **PDF Naming Convention**: For the app to work correctly, name your PDF files with the barcode number (e.g., "12345.pdf").

## Project Structure

- `App.tsx`: Main application component with StorageAccessFramework implementation.
- `App-old.tsx`: Previous version of the app (for reference).
- `app.json`: Expo configuration file with necessary permissions.
- `package.json`: Project dependencies and scripts.
- `assets/`: Contains application assets like icons.

## Technical Notes

- This app uses Android's Storage Access Framework (SAF) for persistent folder access.
- The app is designed for Android only and requires Android 5.0 (API level 21) or higher.
- PDF files are opened in-place without copying, allowing for direct editing of the original files.
