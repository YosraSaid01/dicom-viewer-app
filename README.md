<p align="center">
  <h1>🧠 DICOM Viewer</h1>
  <h3>Advanced Web-Based Radiology Workstation</h3>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-High--Performance-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Build-24--Hour--Prototype-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Domain-Medical--Imaging-red?style=for-the-badge" />
</p>

---

## 📖 Project Overview

A modern, high-performance **web-based DICOM viewer** designed to replicate key functionalities of professional radiology workstations.

> 💡 **Built in 24 hours using advanced prompt engineering**, this project demonstrates expertise in:
> - Medical Image Computing  
> - Multi-Planar Reconstruction (MPR)  
> - Frontend Engineering for Scientific Applications  

---

## 🚀 Key Features

### 🩻 Advanced Visualization
- Upload **single `.dcm` files** or **entire folders**
- Automatic organization: **Patient → Study → Series**
- Windowing presets:
  - Bone
  - Lung
  - Brain
  - Soft Tissue
- Manual window/level adjustment
- **Cine loop** for smooth slice navigation

---

### 🧭 Multi-Planar Reconstruction (MPR)
- 3D volume reconstruction from 2D slices
- Automatic generation of:
  - Axial  
  - Coronal  
  - Sagittal  
- **Synchronized crosshair navigation**
- Accurate geometry using **voxel spacing (no distortion)**

---

### 📏 Precision Clinical Tools
- Distance measurement
- Angle measurement
- Interactive overlays on images
- **Searchable DICOM metadata panel**
- On-demand **3D volume rendering**

---

## 🛠️ Technical Architecture

- **Frontend:** React + HTML5 Canvas  
- **Core Logic:**
  - Custom DICOM parsing pipeline
  - Voxel-space reconstruction
  - Orthogonal slice extraction (MPR)  

- **Performance:**
  - Optimized rendering pipeline
  - On-demand heavy computations (3D)

---

## 💻 Quick Start Guide

```bash
# 1. Clone the repository
git clone https://github.com/YosraSaid01/dicom-viewer-app.git

# 2. Enter the directory & install dependencies
cd dicom-viewer-app
npm install

# 3. Run the application
npm start
```

Then open:

👉 http://localhost:3000

⚠️ Important Considerations

⚠️ Technical Use Only
This project is intended for educational and technical demonstration purposes.

❌ Clinical Disclaimer
This application is not intended for clinical diagnosis.

👩‍💻 Author

Yosra Said
Biomedical Engineer — Medical Imaging, AI & Computational Imaging

Platform	Link
GitHub	https://github.com/YosraSaid01

LinkedIn	(add your link here)
<p align="center"> <b>⭐ If you find this project useful, consider giving it a star!</b> </p> ```
