# 🧠 DICOM Viewer — Advanced Web-Based Radiology Workstation

A modern, high-performance **DICOM viewer built in 24 hours using prompt engineering**.  
This project showcases a web-based radiology workstation capable of loading DICOM studies, generating missing orientations through **true multi-planar reconstruction (MPR)**, displaying metadata, and supporting core image interaction tools used in medical imaging workflows.

---

## ✨ Features

### 🩻 DICOM Loading and Display
- Upload **single DICOM files** or **entire folders/studies**
- Parse and display medical images directly in the browser
- Organize data by **patient / study / series**
- Smooth slice browsing for volumetric datasets

### 🧭 True Multi-Planar Reconstruction (MPR)
- Reconstructs a **3D volume** from axial slices
- Automatically generates the three orthogonal views:
  - **Axial**
  - **Coronal**
  - **Sagittal**
- Synchronized navigation across views using an **interactive crosshair**
- Preserves physical proportions using voxel spacing

### 🧊 Optional 3D Reconstruction
- Generate a **3D view of the volume on demand**
- Designed as an optional feature to avoid unnecessary computation at startup

### 🎚️ Windowing / Contrast Presets
- Contrast can be adjusted depending on the structure of interest
- Includes presets for common CT/MR visualization needs such as:
  - Bone
  - Lung
  - Soft tissue
  - Brain
  - Abdomen
- Manual window/level adjustment for fine control

### 📏 Measurement Tools
- **Distance measurement**
- **Angle measurement**
- Overlay-based interaction directly on the image
- Measurements respect image scaling and spacing when available

### 🎞️ Smooth Navigation and Cine
- Scroll through slices interactively
- Cine playback support for image stacks
- Optimized canvas-based rendering for responsive viewing

### 👥 Multi-Patient / Multi-Series Management
- Load more than one patient or series
- Switch between loaded studies
- Remove unwanted series directly from the interface

### 🧾 DICOM Metadata Display
- View important metadata such as:
  - Patient information
  - Study description
  - Series description
  - Acquisition parameters
- Searchable DICOM tag panel for detailed inspection

---

## 🛠️ Technical Highlights

- Built with **React** and **HTML5 Canvas**
- Custom DICOM parsing pipeline
- Volume reconstruction from 2D slices
- Orthogonal slice extraction for MPR views
- Physical spacing handling to avoid distorted coronal/sagittal views
- Interactive overlay system for:
  - Crosshair navigation
  - Measurements
- Optimized rendering workflow for better local performance

---

## 📸 Main Capabilities

- Display DICOM images directly in the browser
- Generate missing orientations from the original stack
- Explore volumes in three synchronized planes
- Adjust contrast based on anatomy of interest
- Measure structures interactively
- Inspect metadata and DICOM tags
- Optionally generate a 3D reconstruction
- Load and manage multiple patients/series

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/YosraSaid01/dicom-viewer-app.git
cd dicom-viewer-app
