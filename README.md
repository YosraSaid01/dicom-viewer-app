🧠 DICOM Viewer — Advanced Web-Based Radiology Workstation

A modern, high-performance DICOM viewer built in 24 hours using prompt engineering, designed to replicate core features of professional radiology workstations.

This project demonstrates medical imaging engineering, frontend performance optimization, and DICOM understanding — from raw parsing to multi-planar reconstruction (MPR).

🚀 Features
🩻 1. DICOM Loading & Visualization
Upload single files or full DICOM folders
Automatic parsing of:
Patient / Study / Series hierarchy
Pixel data + metadata
Smooth slice navigation (scroll, cine playback)
🧭 2. True Multi-Planar Reconstruction (MPR)
Automatically reconstructs a 3D volume from axial slices
Generates missing orientations:
Axial
Coronal
Sagittal
All views are synchronized via:
Interactive crosshair navigation
Physically correct aspect ratio using voxel spacing

💡 This is NOT simple slice reformatting — it uses true volumetric reconstruction

🧊 3. Optional 3D Volume Reconstruction
On-demand 3D generation (not automatic for performance)
Allows volumetric exploration of the dataset
🎚️ 4. Advanced Windowing (Contrast Control)
Presets adapted to modality:
CT: Bone / Lung / Soft Tissue / Brain / Abdomen
MR: T1 / T2 / FLAIR
Manual window/level adjustment
Accurate HU-based rendering
📏 5. Measurement Tools
📐 Distance measurement (mm-accurate using pixel spacing)
📐 Angle measurement
Interactive drawing directly on image
Visual overlays with real-time feedback
🎞️ 6. Cine Playback
Play slices as a video loop
Adjustable FPS
Smooth rendering using requestAnimationFrame
🧬 7. Multi-Patient / Multi-Series Management
Load multiple patients
Navigate between series
Delete unwanted series dynamically
🧾 8. Full DICOM Metadata Viewer
Displays all DICOM tags
Searchable and structured view
Highlights key clinical information:
Patient info
Study details
Acquisition parameters
🎯 9. Professional UX (Radiology-Inspired)
Multi-viewport layout (MPR panels)
Keyboard shortcuts
Smooth scrolling and navigation
Clean, modern interface
🧪 Technical Highlights
🧠 Custom DICOM parser (no heavy libraries)
🧊 3D volume reconstruction from 2D slices
📐 Correct handling of:
Pixel spacing
Slice thickness
Image orientation (DICOM coordinate system)
⚡ Performance optimizations:
Offscreen canvas rendering
RAF-based cine playback
Slice deduplication for large datasets
🔬 Robust handling of real-world datasets:
Missing metadata fallback
Inconsistent slice spacing handling
Large series (hundreds of slices)
🛠️ Tech Stack
React (Frontend)
JavaScript (no heavy frameworks)
HTML5 Canvas (rendering)
Custom-built:
DICOM parser
Volume builder
MPR engine
📂 Project Structure (example)
src/
 ├── dicom-parser
 ├── volume-builder
 ├── mpr-slicer
 ├── rendering
 ├── measurement-tools
 └── UI-components
▶️ Getting Started
git clone https://github.com/YosraSaid01/dicom-viewer-app.git
cd dicom-viewer-app
npm install
npm run start

Then open:

http://localhost:3000
📦 Test Data

You can use public datasets such as:

TCIA (The Cancer Imaging Archive)
Open DICOM sample datasets
⚠️ Limitations
Limited support for compressed DICOM formats (JPEG, JPEG2000)
3D rendering depends on dataset size (may be heavy for very large volumes)
Designed as a research / demo-grade workstation, not clinical use
💡 Why This Project Matters

This project showcases:

Real understanding of medical imaging pipelines
Ability to go from raw DICOM → 3D volume → clinical visualization
Strong skills in:
Biomedical engineering
Computer vision
Frontend performance
UX for medical applications
🧑‍💻 Author

Yosra Said
Biomedical Engineer — Medical Imaging & AI

🔗 GitHub: https://github.com/YosraSaid01
🔗 LinkedIn: (add your link)
⭐ If you like this project

Give it a star ⭐ and feel free to contribute or reach out!
