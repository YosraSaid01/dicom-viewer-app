# 🧠 DICOM Viewer — Advanced Web-Based Radiology Workstation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![Medical Imaging](https://img.shields.io/badge/Domain-Medical%20Imaging-red)](https://github.com/YosraSaid01/dicom-viewer-app)

A modern, high-performance **web-based DICOM viewer** designed to replicate the critical functionalities of professional radiology workstations. 

> ⚡ **Project Highlight:** Built in **24 hours** using advanced prompt engineering, this project demonstrates rapid prototyping of complex medical image computing and volumetric reconstruction (MPR) systems.

---

## 🚀 Key Features

### 🩻 DICOM Loading & Visualization
* **Universal Upload:** Support for single `.dcm` files or entire folder studies.
* **Smart Organization:** Automatic hierarchical sorting by **Patient → Study → Series**.
* **Native Rendering:** 100% browser-based canvas rendering; no external plugins required.

### 🧭 True Multi-Planar Reconstruction (MPR)
* **3D Synthesis:** Reconstructs full volumes from 2D axial stacks.
* **Orthogonal Views:** Simultaneous display of **Axial, Coronal, and Sagittal** planes.
* **Linked Navigation:** Synchronized crosshairs for precise anatomical localization.
* **Geometric Integrity:** Corrects for voxel spacing to prevent image distortion.

### 🎚️ Clinical Tools & Analysis
* **Windowing Presets:** Quick-toggle for Bone, Lung, Soft Tissue, Brain, and Abdomen.
* **Precision Tools:** Distance and angle measurements with physically accurate scaling.
* **Cine Playback:** Smooth interactive scrolling and automated stack playback.
* **Metadata Explorer:** Searchable DICOM tag panel for acquisition parameters.

---

## 🛠️ Technical Architecture

This workstation is built on a custom-engineered pipeline designed for performance and accuracy:

* **Core Engine:** React + HTML5 Canvas for high-frequency UI updates.
* **Processing Pipeline:** Custom DICOM parsing logic and orthogonal slice extraction.
* **Optimization:** On-demand 3D reconstruction and lazy-loading of heavy volumetric data to maintain a responsive UI.

---

## 📸 Project Impact

This project serves as a comprehensive demonstration of:
1.  **End-to-End Development:** From raw binary DICOM data to a functional UI.
2.  **Scientific Visualization:** Implementing complex MPR algorithms.
3.  **Performance Mindset:** Handling high-dimensional data efficiently in a browser environment.
4.  **UX/UI Design:** Creating an intuitive interface tailored for radiology workflows.

---

## 💻 Getting Started

Get the workstation running locally in seconds:

```bash
# Clone the repository
git clone [https://github.com/YosraSaid01/dicom-viewer-app.git](https://github.com/YosraSaid01/dicom-viewer-app.git)

# Enter the directory
cd dicom-viewer-app

# Install dependencies
npm install

# Launch the application
npm start

Once started, navigate to: http://localhost:3000

⚠️ Important Considerations
Technical Use Only: This tool is intended for educational and technical demonstration.

Clinical Disclaimer: ❌ Not for clinical diagnosis.

Performance: 3D reconstruction performance is dependent on client-side hardware and dataset size.

👩‍💻 Author & Visionary
Yosra Said Biomedical Engineer — Medical Imaging, AI & Computational Imaging

GitHub: @YosraSaid01

LinkedIn: [Your Profile Link Here]

This project sits at the intersection of Biomedical Engineering, Computer Vision, and Frontend Architecture, proving that complex medical systems can be prototyped rapidly without sacrificing scientific rigor.

<p align="center">
<b>If you find this project useful, please consider giving it a ⭐!</b>
</p>
