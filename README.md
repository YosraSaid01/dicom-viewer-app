# 🧠 DICOM Viewer — Advanced Web-Based Radiology Workstation

A modern, high-performance **web-based DICOM viewer** designed to replicate key functionalities of professional radiology workstations.

⚡ Built in **24 hours using advanced prompt engineering**, this project demonstrates strong capabilities in:
- Medical image computing
- Volumetric reconstruction (MPR)
- Frontend engineering for scientific applications
- Rapid prototyping of complex systems

---

## 🚀 Key Features

### 🩻 DICOM Loading & Visualization
- Upload **single DICOM files** or **entire studies (folders)**
- Automatic organization by **Patient → Study → Series**
- Smooth slice navigation for volumetric datasets
- Browser-based rendering (no external software required)

---

### 🧭 True Multi-Planar Reconstruction (MPR)
- Reconstruction of a **3D volume from axial slices**
- Automatic generation of:
  - Axial
  - Coronal
  - Sagittal views
- **Synchronized navigation** using an interactive crosshair
- Preserves correct geometry using **voxel spacing (no distortion)**

---

### 🧊 Optional 3D Reconstruction
- Generate a **3D view on demand**
- Avoids unnecessary computation at startup
- Designed for performance-conscious workflows

---

### 🎚️ Windowing / Contrast Control
- Presets for common visualization:
  - Bone
  - Lung
  - Soft Tissue
  - Brain
  - Abdomen
- Manual **window/level adjustment** for fine control

---

### 📏 Measurement Tools
- Distance measurement
- Angle measurement
- Interactive overlays directly on images
- Physically accurate scaling using pixel spacing

---

### 🎞️ Smooth Navigation & Cine
- Interactive slice scrolling
- Cine playback for image stacks
- Optimized **canvas-based rendering**

---

### 👥 Multi-Study Management
- Load multiple patients and series
- Switch between datasets easily
- Remove unwanted series dynamically

---

### 🧾 DICOM Metadata & Tag Explorer
- Display key metadata:
  - Patient information
  - Study / Series descriptions
  - Acquisition parameters
- **Searchable DICOM tag panel**
- Structured metadata visualization

---

## 🛠️ Technical Architecture

- **Frontend:** React + HTML5 Canvas  
- **Core Components:**
  - Custom DICOM parsing pipeline
  - 3D volume reconstruction from 2D slices
  - Orthogonal slice extraction (MPR)
  - Voxel spacing handling for accurate aspect ratios  

- **Interaction System:**
  - Crosshair navigation
  - Measurement overlays

- **Performance Optimization:**
  - Efficient rendering pipeline
  - On-demand heavy computations (3D)

---

## 📸 What This Project Demonstrates

✔ End-to-end **medical imaging application development**  
✔ Strong understanding of **DICOM and volumetric data**  
✔ Implementation of **multi-planar reconstruction (MPR)**  
✔ Design of **interactive scientific visualization tools**  
✔ Clean and intuitive **radiology-style UI/UX**  
✔ Rapid prototyping using **AI-assisted engineering**

---

## 🚀 Getting Started

```bash
git clone https://github.com/YosraSaid01/dicom-viewer-app.git
cd dicom-viewer-app
npm install
npm start
Then open:

👉 http://localhost:3000

---

## ⚠️ Limitations

- Limited support for some **compressed DICOM transfer syntaxes**
- 3D reconstruction can be **computationally intensive** for large datasets
- Intended for **technical / educational use only**
- ❌ Not for clinical diagnosis

---

## 👩‍💻 Author

**Yosra Said**  
Biomedical Engineer — Medical Imaging, AI & Computational Imaging  

- GitHub: https://github.com/YosraSaid01  
- LinkedIn: *(add your link here)*  

---

## ⭐ About This Project

Developed in **24 hours**, this project sits at the intersection of:

- Biomedical Engineering  
- Medical Image Computing  
- Computer Vision & AI  
- Frontend Engineering  
- Human-Computer Interaction  

💡 This project demonstrates the ability to transform **complex medical imaging concepts into a functional, high-performance software system**.

---

## 🔥 Why This Matters (for Recruiters)

This is not just a demo — it highlights:

- Understanding of **real radiology workflows**
- Ability to handle **high-dimensional medical data**
- Strong **engineering + performance mindset**
- Experience bridging **AI, medical imaging, and software development**

---

⭐ If you find this project interesting, feel free to star the repository!
