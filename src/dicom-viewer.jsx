import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";

/*
╔══════════════════════════════════════════════════════════════════════════════╗
║  DICOM VIEWER V4.1 — True MPR Radiology Workstation                        ║
║                                                                              ║
║  ROOT CAUSE OF V4 BUG: All 4 viewports received same axial stack.          ║
║  No volume was constructed, no orthogonal slicing was performed.            ║
║                                                                              ║
║  V4.1 FIX — True MPR via volume reconstruction:                              ║
║  ✓ buildVolume(): Stacks all axial slices → single 3D Float32 volume       ║
║  ✓ extractMPRSlice(): Coronal (XZ) + Sagittal (YZ) from volume            ║
║  ✓ VP1=Axial, VP2=Coronal, VP3=Sagittal, VP4=Axial(reference)             ║
║  ✓ 3D crosshair: click in any view → updates slice position in all 3      ║
║  ✓ W/L presets FULLY preserved (CT: Bone/Lung/Soft/Brain + MR: T1/T2)     ║
║  ✓ Measurements, cine, keyboard shortcuts all preserved per-viewport       ║
║                                                                              ║
║  PRESERVED UNCHANGED:                                                        ║
║  • DicomParser, buildImageStack, renderDicomImage, computeAutoWL            ║
║  • reducer, measurement engine, useCinePlayer, WL_PRESETS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
*/

// ═══════════════════════════════════════════════════════════════════
const T={bg0:"#060711",bg1:"#0a0c16",bg2:"#0e1019",bg3:"#141722",bg4:"#1a1e2e",bg5:"#222738",t0:"#f0f1f4",t1:"#c8cad3",t2:"#8b8fa3",t3:"#5c6078",t4:"#3d4157",acc:"#3b9eff",accM:"rgba(59,158,255,.12)",accB:"rgba(59,158,255,.25)",accT:"#6cb4ff",grn:"#34d399",grnM:"rgba(52,211,153,.12)",grnB:"rgba(52,211,153,.3)",org:"#fb923c",orgM:"rgba(251,146,60,.12)",orgB:"rgba(251,146,60,.3)",red:"#f87171",redM:"rgba(248,113,113,.08)",vio:"#a78bfa",vioM:"rgba(167,139,250,.12)",vioB:"rgba(167,139,250,.3)",yel:"#fbbf24",yelM:"rgba(251,191,36,.12)",yelB:"rgba(251,191,36,.3)"};
const ORI_COLORS={axial:"#3b9eff",coronal:"#34d399",sagittal:"#fb923c","3d":"#a78bfa",reference:"#a78bfa"};

// ═══════════════════════════════════════════════════════════════════
// SECTIONS 1-6: PRESERVED (Parser, Stack, Renderer, Reducer)
// ═══════════════════════════════════════════════════════════════════
const TAG_DICT={"00020010":"Transfer Syntax UID","00080018":"SOP Instance UID","00080020":"Study Date","00080030":"Study Time","00080050":"Accession Number","00080060":"Modality","00080070":"Manufacturer","00080080":"Institution Name","00080090":"Referring Physician","00081030":"Study Description","0008103E":"Series Description","00100010":"Patient Name","00100020":"Patient ID","00100030":"Patient Birth Date","00100040":"Patient Sex","00101010":"Patient Age","00180015":"Body Part Examined","00180050":"Slice Thickness","00181030":"Protocol Name","0020000D":"Study Instance UID","0020000E":"Series Instance UID","00200010":"Study ID","00200011":"Series Number","00200013":"Instance Number","00200032":"Image Position (Patient)","00200037":"Image Orientation (Patient)","00201041":"Slice Location","00280002":"Samples per Pixel","00280004":"Photometric Interpretation","00280010":"Rows","00280011":"Columns","00280030":"Pixel Spacing","00280100":"Bits Allocated","00280101":"Bits Stored","00280102":"High Bit","00280103":"Pixel Representation","00281050":"Window Center","00281051":"Window Width","00281052":"Rescale Intercept","00281053":"Rescale Slope","7FE00010":"Pixel Data"};
const EXPLICIT_SHORT_VRS=new Set(["AE","AS","AT","CS","DA","DS","DT","FL","FD","IS","LO","LT","OF","PN","SH","SL","SS","ST","TM","UI","UL","US"]);
const DEBUG=true;const debugLog=(c,...a)=>{if(!DEBUG)return;console.log(`%c[DICOM:${c}]%c ${new Date().toISOString().slice(11,23)}`,"color:#3b9eff;font-weight:bold","color:#6b7280",...a);};

class DicomParser{constructor(ab){this.buffer=ab;this.view=new DataView(ab);this.bytes=new Uint8Array(ab);this.offset=0;this.elements={};this.transferSyntax="1.2.840.10008.1.2.1";this.littleEndian=true;this.pixelDataInfo=null;}
parse(){if(this.buffer.byteLength<136)throw new Error("File too small");const m=this._sa(128,4);if(m==="DICM")this.offset=132;else{this.offset=0;const g=this.view.getUint16(0,true);if(g!==0x0002&&g!==0x0008&&g!==0x0010)throw new Error("Not DICOM");}this._pg();const ts=this.elements["00020010"];if(ts?.sv)this.transferSyntax=ts.sv.replace(/\0/g,"").trim();this.littleEndian=this.transferSyntax!=="1.2.840.10008.1.2.2";this._pd(this.transferSyntax==="1.2.840.10008.1.2");return this._build();}
_sa(o,l){let s="";for(let i=0;i<l;i++)s+=String.fromCharCode(this.bytes[o+i]);return s;}_rs(l){if(this.offset+l>this.buffer.byteLength)return"";let s="";for(let i=0;i<l;i++)s+=String.fromCharCode(this.bytes[this.offset+i]);return s.replace(/\0/g,"").trim();}
_pg(){while(this.offset<this.buffer.byteLength-4){if(this.view.getUint16(this.offset,true)!==0x0002)break;this._re(true,true);}}_pd(imp){while(this.offset<this.buffer.byteLength-4){try{this._re(!imp,this.littleEndian);}catch{break;}}}
_re(ev,le){if(this.offset+4>this.buffer.byteLength)throw new Error("EOF");const g=this.view.getUint16(this.offset,le),e=this.view.getUint16(this.offset+2,le);this.offset+=4;const tk=g.toString(16).toUpperCase().padStart(4,"0")+e.toString(16).toUpperCase().padStart(4,"0");if(g===0xFFFE){const il=this.view.getUint32(this.offset,le);this.offset+=4;if(e===0xE000&&il!==0xFFFFFFFF)this.offset+=il;else if(e===0xE000)this._si(le);return;}let vr="UN",vl;if(ev){if(this.offset+2>this.buffer.byteLength)throw new Error("EOF");vr=String.fromCharCode(this.bytes[this.offset],this.bytes[this.offset+1]);this.offset+=2;if(!/^[A-Z]{2}$/.test(vr)){this.offset-=6;this.offset+=4;vl=this.view.getUint32(this.offset,le);this.offset+=4;vr=this._iv(tk);}else if(EXPLICIT_SHORT_VRS.has(vr)){vl=this.view.getUint16(this.offset,le);this.offset+=2;}else{this.offset+=2;vl=this.view.getUint32(this.offset,le);this.offset+=4;}}else{vl=this.view.getUint32(this.offset,le);this.offset+=4;vr=this._iv(tk);}if(tk==="7FE00010"){if(vl===0xFFFFFFFF){this.pixelDataInfo={offset:this.offset,length:this.buffer.byteLength-this.offset,enc:true};this.elements[tk]={vr,sv:"[Enc]",rl:0};this.offset=this.buffer.byteLength;return;}this.pixelDataInfo={offset:this.offset,length:vl,enc:false};this.elements[tk]={vr,sv:"[PD]",rl:vl};this.offset+=vl;return;}if(vl===0xFFFFFFFF){this.elements[tk]={vr,sv:"[Seq]",rl:0};this._ss(le);return;}if(vl>this.buffer.byteLength-this.offset)throw new Error("Overflow");const el={vr,rl:vl};this._rv(el,vr,vl,le);this.elements[tk]=el;this.offset+=vl;}
_rv(el,vr,l,le){if(l===0){el.sv="";return;}const tv=["AE","AS","CS","DA","DS","DT","IS","LO","LT","PN","SH","ST","TM","UI","UT","UC","UR"];if(tv.includes(vr)){el.sv=this._rs(l);if((vr==="DS"||vr==="IS")&&el.sv){const p=el.sv.split("\\");if(p.length===1){const n=parseFloat(p[0]);if(!isNaN(n))el.nv=n;}else el.nvs=p.map(x=>parseFloat(x)).filter(n=>!isNaN(n));}return;}if(vr==="US"){el.nv=this.view.getUint16(this.offset,le);el.sv=String(el.nv);return;}if(vr==="SS"){el.nv=this.view.getInt16(this.offset,le);el.sv=String(el.nv);return;}if(vr==="UL"){el.nv=this.view.getUint32(this.offset,le);el.sv=String(el.nv);return;}if(vr==="SL"){el.nv=this.view.getInt32(this.offset,le);el.sv=String(el.nv);return;}if(vr==="FL"){el.nv=this.view.getFloat32(this.offset,le);el.sv=String(el.nv);return;}if(vr==="FD"){el.nv=this.view.getFloat64(this.offset,le);el.sv=String(el.nv);return;}if(l<=80){let s="";for(let i=0;i<l;i++)s+=String.fromCharCode(this.bytes[this.offset+i]);const c2=s.replace(/[\x00-\x1F\x7F-\xFF]/g,"");el.sv=c2.length>l*0.4?c2.trim():`[${vr}:${l}B]`;}else el.sv=`[${vr}:${l}B]`;}
_iv(tk){return{"00280010":"US","00280011":"US","00280002":"US","00280100":"US","00280101":"US","00280102":"US","00280103":"US","00280008":"IS","00200013":"IS","00200011":"IS","00200012":"IS"}[tk]||"LO";}
_si(le){while(this.offset<this.buffer.byteLength-4){if(this.view.getUint16(this.offset,le)===0xFFFE&&this.view.getUint16(this.offset+2,le)===0xE00D){this.offset+=8;return;}this.offset++;}}
_ss(le){let d=1;while(this.offset<this.buffer.byteLength-4&&d>0){const g=this.view.getUint16(this.offset,le),e=this.view.getUint16(this.offset+2,le);if(g===0xFFFE&&e===0xE0DD){d--;this.offset+=8;continue;}if(g===0xFFFE&&e===0xE000){const il=this.view.getUint32(this.offset+4,le);this.offset+=8;if(il!==0xFFFFFFFF&&il>0)this.offset+=il;continue;}this.offset++;}}
_gs(k){return this.elements[k]?.sv||""}_gn(k){const el=this.elements[k];if(!el)return undefined;if(el.nv!==undefined)return el.nv;if(el.sv){const n=parseFloat(el.sv);return isNaN(n)?undefined:n;}return undefined;}_gna(k){const el=this.elements[k];if(!el)return null;if(el.nvs)return el.nvs;if(el.sv){const p=el.sv.split("\\").map(s=>parseFloat(s.trim()));return p.some(isNaN)?null:p;}return null;}
_build(){const rows=this._gn("00280010")||0,cols=this._gn("00280011")||0,ba=this._gn("00280100")||16,bs=this._gn("00280101")||ba,hb=this._gn("00280102")||(bs-1),pr=this._gn("00280103")||0,spp=this._gn("00280002")||1,sl=this._gn("00281053")??1,ic=this._gn("00281052")??0;
const isEncapsulated=this.pixelDataInfo?.enc||false;
const isCompressedTS=this.transferSyntax.startsWith("1.2.840.10008.1.2.4")||this.transferSyntax==="1.2.840.10008.1.2.5";
let pd=null;if(this.pixelDataInfo&&!this.pixelDataInfo.enc&&rows>0&&cols>0){const{offset:o,length:l}=this.pixelDataInfo;const np=rows*cols*spp;try{if(ba===8)pd=new Uint8Array(this.buffer.slice(o,o+Math.min(np,l)));else if(ba===16){const bc=Math.min(np*2,l,this.buffer.byteLength-o);pd=pr===1?new Int16Array(this.buffer.slice(o,o+bc)):new Uint16Array(this.buffer.slice(o,o+bc));}else if(ba===32)pd=new Float32Array(this.buffer.slice(o,o+Math.min(np*4,l,this.buffer.byteLength-o)));}catch(e){debugLog("PARSE",`Pixel data extraction failed: ${e.message}`);}}
if(!pd&&rows>0&&cols>0){debugLog("PARSE",`⚠️ No pixelData: rows=${rows} cols=${cols} ba=${ba} enc=${isEncapsulated} compressedTS=${isCompressedTS} ts=${this.transferSyntax}`);}
const at={};for(const[k,v]of Object.entries(this.elements))at[k]={vr:v.vr,value:v.sv??`[${v.vr}]`,length:v.rl};return{sopInstanceUid:this._gs("00080018"),studyInstanceUid:this._gs("0020000D"),seriesInstanceUid:this._gs("0020000E"),instanceNumber:this._gn("00200013"),imagePositionPatient:this._gna("00200032"),imageOrientationPatient:this._gna("00200037"),sliceLocation:this._gn("00201041"),patientName:this._gs("00100010"),patientId:this._gs("00100020"),patientBirthDate:this._gs("00100030"),patientSex:this._gs("00100040"),patientAge:this._gs("00101010"),studyDate:this._gs("00080020"),studyTime:this._gs("00080030"),studyDescription:this._gs("00081030"),studyId:this._gs("00200010"),accessionNumber:this._gs("00080050"),institutionName:this._gs("00080080"),referringPhysician:this._gs("00080090"),seriesNumber:this._gn("00200011"),seriesDescription:this._gs("0008103E"),modality:this._gs("00080060"),manufacturer:this._gs("00080070"),bodyPart:this._gs("00180015"),protocolName:this._gs("00181030"),rows,cols,bitsAllocated:ba,bitsStored:bs,highBit:hb,pixelRepresentation:pr,samplesPerPixel:spp,rescaleSlope:sl,rescaleIntercept:ic,windowCenter:this._gn("00281050"),windowWidth:this._gn("00281051"),photometricInterpretation:this._gs("00280004")||"MONOCHROME2",pixelSpacing:this._gs("00280030"),sliceThickness:this._gn("00180050"),transferSyntax:this.transferSyntax,isCompressed:isCompressedTS,isEncapsulated,pixelData:pd,allTags:at};}}

function buildImageStack(inst){debugLog("STACK",`Building: ${inst.length}`);const seen=new Map();for(const i of inst){const u=i.sopInstanceUid||`_${Math.random().toString(36).slice(2)}`;if(!seen.has(u))seen.set(u,i);}let uq=Array.from(seen.values());const ic=uq.filter(i=>i.imagePositionPatient?.length===3&&isFinite(i.imagePositionPatient[2])).length;const nc=uq.filter(i=>i.instanceNumber!=null&&isFinite(i.instanceNumber)).length;let st;if(ic>=uq.length*0.8)st="IPP_Z";else if(nc>=uq.length*0.8)st="INSTANCE_NUMBER";else st="SOP_UID";const sorted=[...uq].sort((a,b)=>{if(st==="IPP_Z"){const zA=a.imagePositionPatient?.[2],zB=b.imagePositionPatient?.[2];if(zA!=null&&zB!=null&&isFinite(zA)&&isFinite(zB)){const d=zA-zB;if(Math.abs(d)>1e-6)return d;}}const iA=a.instanceNumber,iB=b.instanceNumber;if(iA!=null&&iB!=null&&isFinite(iA)&&isFinite(iB)&&iA!==iB)return iA-iB;return(a.sopInstanceUid||"").localeCompare(b.sopInstanceUid||"");});
// ── Secondary dedup: remove near-duplicate IPP positions ──────────────
// Some DICOM datasets contain re-exported or duplicate slices at nearly
// identical positions that differ by < 0.01 mm. These cause repeated-slice
// loops when scrolling. After sorting, drop consecutive slices whose IPP
// positions are within tolerance (keep the first).
let deduped = sorted;
if(st==="IPP_Z"&&sorted.length>1){deduped=[sorted[0]];for(let k=1;k<sorted.length;k++){const prev=deduped[deduped.length-1];const cur=sorted[k];const p0=prev.imagePositionPatient;const p1=cur.imagePositionPatient;if(p0?.length===3&&p1?.length===3){const dx=p1[0]-p0[0],dy=p1[1]-p0[1],dz=p1[2]-p0[2];const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);if(dist<0.01){continue;}}deduped.push(cur);}if(deduped.length<sorted.length)debugLog("STACK",`IPP dedup removed ${sorted.length-deduped.length} near-duplicate slices`);}
debugLog("STACK",`Final: ${deduped.length} slices (${st})`);return deduped;}

function renderDicomImage(canvas,instance,viewport){if(!canvas)return;const ctx=canvas.getContext("2d");if(!ctx)return;const cw=canvas.width,ch=canvas.height;if(cw<2||ch<2)return;ctx.fillStyle="#000";ctx.fillRect(0,0,cw,ch);if(!instance||!instance.pixelData||instance.rows===0||instance.cols===0){ctx.fillStyle="#555";ctx.font="12px system-ui";ctx.textAlign="center";if(!instance){ctx.fillText("Waiting for image data…",cw/2,ch/2);}else if(instance.isCompressed||instance.isEncapsulated){ctx.fillText("Unsupported compressed DICOM",cw/2,ch/2);ctx.font="10px system-ui";ctx.fillText(`Transfer syntax: ${instance.transferSyntax||"unknown"}`,cw/2,ch/2+16);}else if(!instance.pixelData){ctx.fillText("No pixel data",cw/2,ch/2);}else{ctx.fillText("Invalid image dimensions",cw/2,ch/2);}return;}const{rows,cols,pixelData,rescaleSlope,rescaleIntercept,photometricInterpretation,samplesPerPixel}=instance;const{zoom,panX,panY,windowCenter:wc,windowWidth:ww}=viewport;
  // ── Physical spacing: respect voxel geometry so MPR views are not stretched ──
  // pixelSpacing format: "rowSpacing\colSpacing" (mm per pixel)
  // rowSpacing = physical height of one pixel (y-direction)
  // colSpacing = physical width of one pixel (x-direction)
  let spacingRow=1,spacingCol=1;
  if(instance.pixelSpacing){const ps=instance.pixelSpacing.split("\\").map(Number);if(ps.length>=2&&ps.every(isFinite)&&ps[0]>0&&ps[1]>0){spacingRow=ps[0];spacingCol=ps[1];}}
  const physW=cols*spacingCol; // physical width in mm
  const physH=rows*spacingRow; // physical height in mm
  // Fit scale: fit physical extent into canvas, preserving aspect ratio
  const fs=Math.min(cw/physW,ch/physH);
  const dispW=physW*fs*zoom; // display width in pixels
  const dispH=physH*fs*zoom; // display height in pixels
  debugLog&&false&&console.log(`[renderDicomImage] spacing=${spacingRow}x${spacingCol} physWH=${physW.toFixed(1)}x${physH.toFixed(1)} dispWH=${dispW.toFixed(1)}x${dispH.toFixed(1)}`);
  const imgData=ctx.createImageData(cols,rows);const rgba=imgData.data;const isRGB=samplesPerPixel>=3;const inv=photometricInterpretation==="MONOCHROME1";if(isRGB){for(let i=0;i<rows*cols;i++){const si=i*samplesPerPixel;rgba[i*4]=pixelData[si]||0;rgba[i*4+1]=pixelData[si+1]||0;rgba[i*4+2]=pixelData[si+2]||0;rgba[i*4+3]=255;}}else{const lo=wc-ww/2,hi=wc+ww/2,range=hi-lo||1;const n=Math.min(rows*cols,pixelData.length);for(let i=0;i<n;i++){let hu=pixelData[i]*rescaleSlope+rescaleIntercept;let v=hu<=lo?0:hu>=hi?255:((hu-lo)/range)*255;if(inv)v=255-v;rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=v;rgba[i*4+3]=255;}}
  // Reuse offscreen canvas to avoid DOM allocation + GC pressure per frame
  if(!renderDicomImage._off){renderDicomImage._off=document.createElement("canvas");}
  const off=renderDicomImage._off;
  if(off.width!==cols||off.height!==rows){off.width=cols;off.height=rows;}
  off.getContext("2d").putImageData(imgData,0,0);ctx.imageSmoothingEnabled=zoom<4;ctx.imageSmoothingQuality="high";ctx.drawImage(off,(cw-dispW)/2+panX,(ch-dispH)/2+panY,dispW,dispH);}

function computeAutoWL(inst){if(!inst?.pixelData)return{wc:128,ww:256};if(inst.windowCenter!=null&&inst.windowWidth!=null&&inst.windowWidth>0)return{wc:inst.windowCenter,ww:inst.windowWidth};let mn=Infinity,mx=-Infinity,sm=0,n=0;const st=Math.max(1,Math.floor(inst.pixelData.length/20000));for(let i=0;i<inst.pixelData.length;i+=st){const hu=inst.pixelData[i]*inst.rescaleSlope+inst.rescaleIntercept;if(hu<mn)mn=hu;if(hu>mx)mx=hu;sm+=hu;n++;}if(!isFinite(mn))return{wc:128,ww:256};return{wc:sm/n,ww:Math.max(mx-mn,1)*0.85};}

const INIT_STATE={studies:{},stacks:{},isLoading:false,loadProgress:{loaded:0,total:0},error:null};
function reducer(state,action){switch(action.type){case"LOAD_START":return{...state,isLoading:true,error:null,loadProgress:{loaded:0,total:action.total}};case"LOAD_PROGRESS":return{...state,loadProgress:{...state.loadProgress,loaded:action.loaded}};case"LOAD_DONE":{const{studies,stacks}=action.payload;return{...state,studies,stacks,isLoading:false};}case"DELETE_SERIES":{const uid=action.uid;const newStudies=JSON.parse(JSON.stringify(state.studies));const newStacks={...state.stacks};delete newStacks[uid];for(const su of Object.keys(newStudies)){if(newStudies[su].series[uid]){delete newStudies[su].series[uid];if(Object.keys(newStudies[su].series).length===0)delete newStudies[su];break;}}debugLog("STATE",`Deleted series ${uid}`);return{...state,studies:newStudies,stacks:newStacks};}case"ERROR":return{...state,error:action.msg,isLoading:false};default:return state;}}

// ═══════════════════════════════════════════════════════════════════
// COORDINATE TRANSFORMS + MEASUREMENT ENGINE — PRESERVED
// ═══════════════════════════════════════════════════════════════════
function getTransform(canvas,inst,vp){if(!canvas||!inst)return null;const cw=canvas.width,ch=canvas.height;
  // Match the physical-spacing logic from renderDicomImage exactly
  let spacingRow=1,spacingCol=1;
  if(inst.pixelSpacing){const ps=inst.pixelSpacing.split("\\").map(Number);if(ps.length>=2&&ps.every(isFinite)&&ps[0]>0&&ps[1]>0){spacingRow=ps[0];spacingCol=ps[1];}}
  const physW=inst.cols*spacingCol,physH=inst.rows*spacingRow;
  const fs=Math.min(cw/physW,ch/physH);
  const dispW=physW*fs*vp.zoom,dispH=physH*fs*vp.zoom;
  // s: scale from image pixels → display pixels (may differ per axis if spacing != 1:1)
  // We return a uniform scale that maps image coords to canvas pixels.
  // For measurement correctness, we need to know both x and y scale factors.
  // We encode s as the col-direction scale; overlay rendering uses toCanvas/toImage.
  const sx=fs*spacingCol*vp.zoom; // canvas px per image pixel (x)
  const sy=fs*spacingRow*vp.zoom; // canvas px per image pixel (y)
  const ox=(cw-dispW)/2+vp.panX;
  const oy=(ch-dispH)/2+vp.panY;
  return{s:sx,sy,ox,oy};}
function toImage(cx,cy,tf){return{x:(cx-tf.ox)/tf.s,y:(cy-tf.oy)/(tf.sy||tf.s)};}
function toCanvas(ix,iy,tf){return{x:ix*tf.s+tf.ox,y:iy*(tf.sy||tf.s)+tf.oy};}
let measIdCounter=0;
function createMeasurement(type){return{id:`m${++measIdCounter}`,type,points:[],done:false};}
function getPixelSpacingMm(inst){if(!inst?.pixelSpacing)return null;const p=inst.pixelSpacing.split("\\").map(Number);return p.length>=2&&p.every(isFinite)?p:null;}
function calcLength(pts,sp){const dx=pts[1].x-pts[0].x,dy=pts[1].y-pts[0].y;return sp?Math.sqrt((dx*sp[1])**2+(dy*sp[0])**2):Math.sqrt(dx*dx+dy*dy);}
function calcAngle(pts){const ax=pts[0].x-pts[1].x,ay=pts[0].y-pts[1].y,bx=pts[2].x-pts[1].x,by=pts[2].y-pts[1].y,dot=ax*bx+ay*by,ma=Math.sqrt(ax*ax+ay*ay),mb=Math.sqrt(bx*bx+by*by);return(ma<1e-9||mb<1e-9)?0:Math.acos(Math.max(-1,Math.min(1,dot/(ma*mb))))*180/Math.PI;}

function renderOverlay(canvas,inst,vp,measurements,cursor,selectedId,crosshair){
  if(!canvas)return;const ctx=canvas.getContext("2d"),cw=canvas.width,ch=canvas.height;ctx.clearRect(0,0,cw,ch);if(!inst?.rows)return;const tf=getTransform(canvas,inst,vp);if(!tf)return;const sp=getPixelSpacingMm(inst);
  for(const m of measurements){const sel=m.id===selectedId;const pts=[...m.points];if(!m.done&&cursor)pts.push(cursor);if(!pts.length)continue;const cPts=pts.map(p=>toCanvas(p.x,p.y,tf));const color=m.type==="length"?T.grn:T.org;ctx.save();ctx.globalAlpha=sel?1:.85;ctx.strokeStyle=color;ctx.lineWidth=sel?2:1.5;ctx.setLineDash(m.done?[]:[4,4]);if(m.type==="length"&&cPts.length>=2){ctx.beginPath();ctx.moveTo(cPts[0].x,cPts[0].y);ctx.lineTo(cPts[1].x,cPts[1].y);ctx.stroke();}else if(m.type==="angle"&&cPts.length>=2){ctx.beginPath();ctx.moveTo(cPts[0].x,cPts[0].y);ctx.lineTo(cPts[1].x,cPts[1].y);if(cPts.length>=3)ctx.lineTo(cPts[2].x,cPts[2].y);ctx.stroke();}ctx.setLineDash([]);for(const cp of cPts){ctx.fillStyle=sel?"#fff":color;ctx.beginPath();ctx.arc(cp.x,cp.y,sel?4:3,0,Math.PI*2);ctx.fill();}if(m.done){let label="";if(m.type==="length"&&pts.length===2){const d=calcLength(pts,sp);label=sp?`${d.toFixed(1)} mm`:`${d.toFixed(1)} px`;}else if(m.type==="angle"&&pts.length===3)label=`${calcAngle(pts).toFixed(1)}°`;if(label){const mx2=(cPts[0].x+cPts[cPts.length-1].x)/2,my2=(cPts[0].y+cPts[cPts.length-1].y)/2-14;ctx.font="bold 11px system-ui";ctx.textAlign="center";ctx.fillStyle="rgba(0,0,0,.7)";const tw=ctx.measureText(label).width;ctx.fillRect(mx2-tw/2-3,my2-9,tw+6,16);ctx.fillStyle=color;ctx.fillText(label,mx2,my2+1);}}ctx.restore();}
  if(crosshair){const cp=toCanvas(crosshair.x,crosshair.y,tf);ctx.save();ctx.strokeStyle=T.yel;ctx.lineWidth=1;ctx.setLineDash([5,3]);ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(0,cp.y);ctx.lineTo(cw,cp.y);ctx.stroke();ctx.beginPath();ctx.moveTo(cp.x,0);ctx.lineTo(cp.x,ch);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=T.yel;ctx.beginPath();ctx.arc(cp.x,cp.y,4,0,Math.PI*2);ctx.fill();ctx.restore();}
}

// ═══════════════════════════════════════════════════════════════════
// useCinePlayer — RAF-based for smooth local-browser performance
// setInterval was causing frame pile-up when rendering was slower than
// the interval period (common locally with MPR extraction + canvas draw).
// RAF respects vsync and naturally throttles to frame budget.
// ═══════════════════════════════════════════════════════════════════
function useCinePlayer(len, disp) {
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(12);
  const [loop, setLoop] = useState(true);
  const ir = useRef(0);          // current index ref (avoids stale closures)
  const rafRef = useRef(null);   // RAF handle
  const lastFrameRef = useRef(0); // timestamp of last frame advance
  // Stable refs for values read inside RAF loop
  const fpsRef = useRef(fps);  fpsRef.current = fps;
  const loopRef = useRef(loop); loopRef.current = loop;
  const lenRef = useRef(len);   lenRef.current = len;
  const dispRef = useRef(disp); dispRef.current = disp;
  const playingRef = useRef(playing); playingRef.current = playing;

  const si = useCallback(i => { ir.current = i; }, []);

  // RAF animation loop — replaces setInterval
  const tick = useCallback((ts) => {
    if (!playingRef.current) return;
    const interval = 1000 / fpsRef.current;
    if (ts - lastFrameRef.current >= interval) {
      lastFrameRef.current = ts;
      const curLen = lenRef.current;
      if (curLen <= 1) return;
      const n = ir.current + 1;
      if (n >= curLen) {
        if (loopRef.current) {
          dispRef.current({ type: "SS", i: 0 });
          ir.current = 0;
        } else {
          setPlaying(false);
          return;
        }
      } else {
        dispRef.current({ type: "SS", i: n });
        ir.current = n;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Start/stop the RAF loop when playing changes
  useEffect(() => {
    if (playing && len > 1) {
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
      debugLog("CINE", `▶ Started — ${fps}fps, loop=${loop}, len=${len}`);
    } else {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (!playing) debugLog("CINE", "⏸ Stopped");
    }
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [playing, len, tick]);

  return {
    playing,
    toggle: useCallback(() => setPlaying(p => !p), []),
    stop: useCallback(() => { setPlaying(false); dispRef.current({ type: "SS", i: 0 }); ir.current = 0; }, []),
    fps, setFps, loop, setLoop, si,
  };
}

// ═══════════════════════════════════════════════════════════════════
// W/L PRESETS — FULLY PRESERVED (CRITICAL)
// ═══════════════════════════════════════════════════════════════════
const WL_PRESETS = {
  CT: [
    { n: "Soft Tissue", wc: 40, ww: 400 },
    { n: "Lung", wc: -600, ww: 1500 },
    { n: "Bone", wc: 400, ww: 1800 },
    { n: "Brain", wc: 40, ww: 80 },
    { n: "Abdomen", wc: 60, ww: 400 },
    { n: "Liver", wc: 60, ww: 150 },
  ],
  MR: [
    { n: "T1 Default", wc: 800, ww: 1600 },
    { n: "T2 Default", wc: 400, ww: 800 },
    { n: "FLAIR", wc: 600, ww: 1200 },
  ],
  CR: [{ n: "Default", wc: 2048, ww: 4096 }],
  DX: [{ n: "Default", wc: 2048, ww: 4096 }],
  _: [{ n: "Auto", wc: null, ww: null }],
};
function getPresetsForModality(mod) { return WL_PRESETS[mod] || WL_PRESETS._; }

// ═══════════════════════════════════════════════════════════════════
// NEW V4.1: VOLUME BUILDER + MPR SLICER
// ═══════════════════════════════════════════════════════════════════

// ── Orientation helpers (DICOM LPS patient coordinate system) ──────
// LPS: +X = Left, +Y = Posterior, +Z = Superior
// IOP tag: [rowX, rowY, rowZ, colX, colY, colZ]
// Slice normal = cross(rowVec, colVec) — points in acquisition direction
// To know if slices increase toward Superior, dot normal with (0,0,1).
// If dot < 0 the normal points Inferior, meaning higher slice index = more inferior.
// In that case, to render coronal/sagittal with Superior at TOP (row 0),
// we must read z in REVERSE order (z = numSlices-1 → row 0, z = 0 → last row).

function _cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}
function _dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function _norm(v) { const m = Math.sqrt(_dot(v,v)); return m < 1e-9 ? v : v.map(x=>x/m); }

// Parse IOP string "r0\r1\r2\c0\c1\c2" → { rowDir, colDir, normal }
function parseIOP(iopStr) {
  if (!iopStr) return null;
  const parts = iopStr.split("\\").map(Number);
  if (parts.length < 6 || parts.some(isNaN)) return null;
  const rowDir = _norm([parts[0], parts[1], parts[2]]);
  const colDir = _norm([parts[3], parts[4], parts[5]]);
  const normal = _norm(_cross(rowDir, colDir));
  return { rowDir, colDir, normal };
}

// Given the sorted stack and the slice normal, determine if increasing z
// index moves toward Superior (+Z in LPS = (0,0,1)).
// Returns true if z=0 IS the most-superior slice (i.e. normal points Inferior).
// In that case coronal/sagittal must sample z in REVERSE to put Superior at top.
function computeVolumeOrientation(stack, normal) {
  // Dot slice normal with LPS Superior axis (0, 0, 1)
  // normal points from slice[0] toward slice[N-1].
  // If dot > 0 → normal points Superior → z increases toward Superior → z=0 is most inferior → Superior is LAST slice.
  // If dot < 0 → normal points Inferior → z increases toward Inferior → z=0 is most superior → Superior is FIRST slice.
  const dotSup = _dot(normal, [0, 0, 1]);

  // Cross-check with actual IPP of first and last slice
  let inferredFromIPP = null;
  const ipp0 = stack[0]?.imagePositionPatient;
  const ippN = stack[stack.length-1]?.imagePositionPatient;
  if (ipp0 && ippN && ipp0.length === 3 && ippN.length === 3) {
    const deltaZ = ippN[2] - ipp0[2]; // positive → last slice is more Superior
    inferredFromIPP = deltaZ; // >0 means z=last is superior; <0 means z=0 is superior
  }

  // superiorIsFirstSlice = true means z=0 is most superior (Superior at start of array)
  // In that case we REVERSE z when filling coronal/sagittal rows so Superior → row 0 (top)
  // Wait — if z=0 is Superior and we put z=0 at row 0, that IS correct (Superior at top).
  // The problem occurs when z=0 is INFERIOR. Then row 0 = Inferior = wrong.
  // So: superiorIsFirstSlice means "we need to reverse z when populating MPR rows".
  // Actually: we want row 0 of the MPR output = most Superior slice.
  // If z=0 is Superior → we want row 0 = z=0 → no flip needed.
  // If z=0 is Inferior → we want row 0 = z=numSlices-1 → flip needed.
  // superiorIsLastSlice: z = numSlices-1 is Superior → flip needed (reverse z).

  let superiorIsLastSlice;
  if (inferredFromIPP !== null && Math.abs(inferredFromIPP) > 0.1) {
    superiorIsLastSlice = inferredFromIPP > 0; // deltaZ>0 → last slice has higher Z (more Superior)
  } else {
    superiorIsLastSlice = dotSup > 0; // normal points superior → last slice is more superior
  }

  debugLog("ORI",
    `IOP normal=[${normal.map(v=>v.toFixed(3)).join(",")}]`,
    `dotSup=${dotSup.toFixed(3)}`,
    `IPP_deltaZ=${inferredFromIPP?.toFixed(2)??'n/a'}`,
    `superiorIsLastSlice=${superiorIsLastSlice}`,
    `→ MPR z-flip needed: ${superiorIsLastSlice}`
  );

  return { superiorIsLastSlice, normal, dotSup };
}

function buildVolume(stack) {
  if (!stack || stack.length < 3) return null;
  const ref = stack[0];
  const { rows, cols } = ref;
  if (!rows || !cols) return null;

  // ── Validate slices: skip invalid ones instead of failing everything ──
  const validSlices = [];
  const skippedIndices = [];
  for (let i = 0; i < stack.length; i++) {
    const s = stack[i];
    if (s.rows !== rows || s.cols !== cols) {
      skippedIndices.push({ i, reason: `dims ${s.rows}x${s.cols} != ${rows}x${cols}` });
    } else if (!s.pixelData || s.pixelData.length === 0) {
      skippedIndices.push({ i, reason: `no pixelData (compressed=${s.isCompressed||false} enc=${s.isEncapsulated||false} ts=${s.transferSyntax||'?'})` });
    } else {
      validSlices.push({ origIdx: i, slice: s });
    }
  }
  if (skippedIndices.length > 0) {
    debugLog("VOLUME", `⚠️ Skipped ${skippedIndices.length}/${stack.length} invalid slices`);
    for (const sk of skippedIndices.slice(0, 5)) debugLog("VOLUME", `  → slice[${sk.i}]: ${sk.reason}`);
    if (skippedIndices.length > 5) debugLog("VOLUME", `  → ... and ${skippedIndices.length - 5} more`);
  }
  // If too many slices are bad, fail gracefully
  if (validSlices.length < 3) {
    debugLog("VOLUME", `❌ Only ${validSlices.length} valid slices (need ≥3). Cannot build volume.`);
    return null;
  }
  if (validSlices.length < stack.length * 0.5) {
    debugLog("VOLUME", `❌ Only ${validSlices.length}/${stack.length} valid slices (<50%). Volume unreliable.`);
    return null;
  }

  // Use validSlices for the volume (re-index contiguously)
  const numSlices = validSlices.length;
  const sliceSize = rows * cols;

  // ── Parse DICOM spatial orientation metadata ──────────────────────
  const iopArray = ref.imageOrientationPatient;
  const iopStr = iopArray
    ? iopArray.join("\\")
    : (ref.allTags?.["00200037"]?.value || null);

  const iop = parseIOP(iopStr);

  const ipp0 = validSlices[0].slice.imagePositionPatient;
  const ippN = validSlices[numSlices-1].slice.imagePositionPatient;

  debugLog("VOLUME", `Building volume: ${cols}×${rows}×${numSlices} (${validSlices.length}/${stack.length} valid)`);
  debugLog("VOLUME", `IOP string: ${iopStr || "(not found)"}`);
  debugLog("VOLUME", `IPP[0]: [${ipp0?.join(",")}]`);
  debugLog("VOLUME", `IPP[N]: [${ippN?.join(",")}]`);
  if (iop) {
    debugLog("VOLUME", `Row dir: [${iop.rowDir.map(v=>v.toFixed(4)).join(",")}]`);
    debugLog("VOLUME", `Col dir: [${iop.colDir.map(v=>v.toFixed(4)).join(",")}]`);
    debugLog("VOLUME", `Slice normal (rowXcol): [${iop.normal.map(v=>v.toFixed(4)).join(",")}]`);
  }

  const volOri = iop
    ? computeVolumeOrientation(validSlices.map(v=>v.slice), iop.normal)
    : computeVolumeOrientation(validSlices.map(v=>v.slice), [0, 0, 1]);

  debugLog("VOLUME", `Camera orientation: superiorIsLastSlice=${volOri.superiorIsLastSlice}`);

  // Build HU volume (pre-apply rescale so MPR slices don't need it)
  let volume;
  try {
    volume = new Float32Array(numSlices * sliceSize);
  } catch (e) {
    debugLog("VOLUME", `❌ Failed to allocate volume: ${numSlices * sliceSize * 4} bytes — ${e.message}`);
    return null;
  }
  for (let z = 0; z < numSlices; z++) {
    const s = validSlices[z].slice;
    const pd = s.pixelData;
    const slope = s.rescaleSlope;
    const intercept = s.rescaleIntercept;
    const base = z * sliceSize;
    const len = Math.min(sliceSize, pd.length);
    for (let i = 0; i < len; i++) {
      volume[base + i] = (pd[i] || 0) * slope + intercept;
    }
  }

  // Compute slice spacing from IPP — use median of ALL consecutive inter-slice
  // distances projected along the slice normal for robustness across datasets.
  let sliceSpacing = ref.sliceThickness || 1;
  if (numSlices >= 2) {
    const normal = iop ? iop.normal : [0, 0, 1];
    const dists = [];
    for (let k = 1; k < numSlices; k++) {
      const ipp0k = validSlices[k - 1].slice.imagePositionPatient;
      const ipp1k = validSlices[k].slice.imagePositionPatient;
      if (ipp0k?.length === 3 && ipp1k?.length === 3) {
        const d = Math.abs(
          (ipp1k[0] - ipp0k[0]) * normal[0] +
          (ipp1k[1] - ipp0k[1]) * normal[1] +
          (ipp1k[2] - ipp0k[2]) * normal[2]
        );
        if (d > 1e-6) dists.push(d);
      }
    }
    if (dists.length > 0) {
      dists.sort((a, b) => a - b);
      sliceSpacing = dists[Math.floor(dists.length / 2)];
    }
  }
  const ps = getPixelSpacingMm(ref) || [1, 1];
  debugLog("VOLUME", `Spacing: row=${ps[0]} col=${ps[1]} slice=${sliceSpacing.toFixed(2)}`);

  const { superiorIsLastSlice } = volOri;

  return {
    volume, rows, cols, numSlices,
    pixelSpacing: ps, sliceSpacing,
    refInstance: ref,
    superiorIsLastSlice,
    iop,
  };
}

function extractMPRSlice(vol, orientation, index) {
  if (!vol) return null;
  const { volume, rows, cols, numSlices, pixelSpacing, sliceSpacing, refInstance, superiorIsLastSlice } = vol;
  const sliceSize = rows * cols;
  let outRows, outCols, outData, outSpacing;

  // ── Anatomical orientation fix ────────────────────────────────────
  // Goal: row 0 of the output image = MOST SUPERIOR anatomy (top of image = head).
  //
  // In DICOM LPS, +Z = Superior.  The volume was built by stacking slices in
  // the order produced by buildImageStack() which sorts by IPP-Z ascending.
  // → z=0 = most INFERIOR (lowest Z), z=numSlices-1 = most SUPERIOR (highest Z).
  //   ... UNLESS superiorIsLastSlice is false, in which z=0 is already Superior.
  //
  // For coronal/sagittal, we iterate z and place each z into an output row.
  // row 0 should be the MOST SUPERIOR z.
  //
  // If superiorIsLastSlice === true:
  //   Most superior z = numSlices-1.
  //   We map: output_row = 0 → z = numSlices-1 (superior)
  //           output_row = numSlices-1 → z = 0 (inferior)
  //   i.e., zSrc = numSlices - 1 - outRow
  //
  // If superiorIsLastSlice === false:
  //   Most superior z = 0.
  //   We map: output_row = 0 → z = 0 (already superior)
  //   i.e., zSrc = outRow (no flip)
  //
  // This ensures Superior is ALWAYS at the top, derived purely from spatial
  // metadata — no hardcoded flips, no CSS transforms.

  const zForRow = superiorIsLastSlice
    ? (outRow) => numSlices - 1 - outRow   // flip: z decreases as row increases
    : (outRow) => outRow;                  // no flip needed

  if (orientation === "axial") {
    // Axial: z is the slice index directly. No flip needed — axial is its own plane.
    const z = Math.max(0, Math.min(numSlices - 1, index));
    outRows = rows; outCols = cols;
    outData = new Float32Array(outRows * outCols);
    const base = z * sliceSize;
    for (let i = 0; i < sliceSize; i++) outData[i] = volume[base + i];
    outSpacing = `${pixelSpacing[0]}\\${pixelSpacing[1]}`;

  } else if (orientation === "coronal") {
    // Coronal: fix Y (anterior–posterior), sweep Z (Superior→Inferior) as rows,
    // sweep X (Left→Right) as cols.
    // Row 0 must be Superior → use zForRow mapping.
    const y = Math.max(0, Math.min(rows - 1, index));
    outRows = numSlices; outCols = cols;
    outData = new Float32Array(outRows * outCols);
    for (let outRow = 0; outRow < numSlices; outRow++) {
      const z = zForRow(outRow);
      for (let x = 0; x < cols; x++) {
        outData[outRow * cols + x] = volume[z * sliceSize + y * cols + x];
      }
    }
    outSpacing = `${sliceSpacing}\\${pixelSpacing[1]}`;

  } else if (orientation === "sagittal") {
    // Sagittal: fix X (Left–Right), sweep Z (Superior→Inferior) as rows,
    // sweep Y (Anterior→Posterior) as cols.
    // Row 0 must be Superior → use zForRow mapping.
    const x = Math.max(0, Math.min(cols - 1, index));
    outRows = numSlices; outCols = rows;
    outData = new Float32Array(outRows * outCols);
    for (let outRow = 0; outRow < numSlices; outRow++) {
      const z = zForRow(outRow);
      for (let y = 0; y < rows; y++) {
        outData[outRow * rows + y] = volume[z * sliceSize + y * cols + x];
      }
    }
    outSpacing = `${sliceSpacing}\\${pixelSpacing[0]}`;

  } else return null;

  // Return synthetic instance (rescale already applied → slope=1, intercept=0)
  return {
    rows: outRows, cols: outCols, pixelData: outData,
    rescaleSlope: 1, rescaleIntercept: 0,
    samplesPerPixel: 1, photometricInterpretation: refInstance.photometricInterpretation,
    pixelSpacing: outSpacing, windowCenter: refInstance.windowCenter, windowWidth: refInstance.windowWidth,
    patientName: refInstance.patientName, patientId: refInstance.patientId,
    modality: refInstance.modality, studyDate: refInstance.studyDate,
    seriesDescription: refInstance.seriesDescription, institutionName: refInstance.institutionName,
    allTags: refInstance.allTags, sliceLocation: index,
    patientSex: refInstance.patientSex, patientAge: refInstance.patientAge,
    studyDescription: refInstance.studyDescription,
  };
}

function getSliceCount(vol, orientation, stack) {
  if (orientation === "axial") return vol ? vol.numSlices : (stack ? stack.length : 0);
  if (!vol) return 0;
  if (orientation === "coronal") return vol.rows;
  if (orientation === "sagittal") return vol.cols;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════
const sv = (d, w = 17) => (p) => <svg {...p} width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const IC = {
  Upload: sv(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>),
  Move: sv(<><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></>),
  ZoomIn: sv(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></>),
  Contrast: sv(<><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M12 2a10 10 0 0 1 0 20"/></>),
  Reset: sv(<><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></>),
  X: sv(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>, 14),
  Search: sv(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>, 14),
  Layers: sv(<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>, 18),
  SidePanel: sv(<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>),
  RightPanel: sv(<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></>),
  User: sv(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>, 15),
  Hash: sv(<><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>, 13),
  Activity: sv(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>, 15),
  Play: sv(<><polygon points="5 3 19 12 5 21 5 3"/></>),
  Pause: sv(<><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>),
  Ruler: sv(<><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0z"/><path d="M14.5 12.5l2-2"/><path d="M11.5 9.5l2-2"/><path d="M8.5 6.5l2-2"/></>),
  Angle: sv(<><path d="M21 19H6.2a2 2 0 0 1-1.7-1L3 15"/><path d="M3 15l10-12"/><path d="M7 15a4 4 0 0 1 1.5-3.1"/></>),
  Trash: sv(<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>),
  Settings: sv(<><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></>),
  Grid2x2: sv(<><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>),
  Grid1x1: sv(<><rect x="3" y="3" width="18" height="18" rx="2"/></>),
  ChevDown: sv(<><polyline points="6 9 12 15 18 9"/></>, 12),
  Crosshair: sv(<><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></>),
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
const fmtDate = d => (!d || d.length < 8) ? "—" : `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
const fmtName = n => n ? n.replace(/\^/g, ", ").trim() : "—";
const fmtTag = k => `(${k.slice(0,4)},${k.slice(4)})`;
const vl = v => (v != null && v !== "") ? String(v) : "—";
function traverseEntry(entry) { return new Promise(resolve => { if (entry.isFile) entry.file(f => resolve([f]), () => resolve([])); else if (entry.isDirectory) { const r = entry.createReader(); const a = []; const rd = () => r.readEntries(e => { if (!e.length) Promise.all(a.map(traverseEntry)).then(r2 => resolve(r2.flat())); else { a.push(...e); rd(); } }, () => resolve([])); rd(); } else resolve([]); }); }

// ═══════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function ToolBtn({ active, icon, label, shortcut, onClick, title: t2, style: sx }) {
  return <button onClick={onClick} title={t2 || `${label || ""}${shortcut ? ` (${shortcut})` : ""}`} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all duration-100" style={{ background: active ? T.accM : "transparent", color: active ? T.accT : T.t2, boxShadow: active ? `inset 0 0 0 1px ${T.accB}` : "none", fontWeight: active ? 600 : 500, ...sx }} onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.bg3; e.currentTarget.style.color = T.t1; } }} onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.t2; } }}>{icon}{label && <span>{label}</span>}{shortcut && <span style={{ fontSize: 9, color: active ? T.acc : T.t4, background: active ? "transparent" : T.bg2, padding: "1px 4px", borderRadius: 3, fontFamily: "monospace" }}>{shortcut}</span>}</button>;
}
function MeasBtn({ active, icon, label, color, colorM, colorB, onClick, shortcut }) {
  return <button onClick={onClick} title={`${label} (${shortcut})`} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all duration-100" style={{ background: active ? colorM : "transparent", color: active ? color : T.t2, boxShadow: active ? `inset 0 0 0 1px ${colorB}` : "none", fontWeight: active ? 600 : 500 }} onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.bg3; } }} onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; } }}>{icon}<span>{label}</span><span style={{ fontSize: 9, color: active ? color : T.t4, background: T.bg2, padding: "1px 4px", borderRadius: 3, fontFamily: "monospace" }}>{shortcut}</span></button>;
}
function ToolSep() { return <div style={{ width: 1, height: 20, background: T.bg4, margin: "0 3px", flexShrink: 0 }} />; }
function InfoRow({ label, value, mono }) { const d = vl(value); return <div className="flex items-baseline gap-2 py-[2px]"><span style={{ fontSize: 11, color: T.t3, width: 86, flexShrink: 0, fontWeight: 500 }}>{label}</span><span style={{ fontSize: mono ? 10 : 11, color: T.t1, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all", lineHeight: 1.3 }}>{d}</span></div>; }
function SectionHead({ icon, title, count }) { return <div className="flex items-center gap-2 pb-1 mb-1" style={{ borderBottom: `1px solid ${T.bg4}` }}>{icon && <span style={{ color: T.t3 }}>{icon}</span>}<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.t3 }}>{title}</span>{count != null && <span style={{ fontSize: 9, color: T.t4, marginLeft: "auto", fontFamily: "monospace" }}>{count}</span>}</div>; }
function ModalityBadge({ modality }) { if (!modality) return null; const c = { CT: "#3b9eff", MR: "#a78bfa", US: "#34d399", CR: "#fbbf24", DX: "#fb923c" }[modality] || T.t3; return <span style={{ fontSize: 9, fontWeight: 700, color: c, background: `${c}15`, padding: "1px 5px", borderRadius: 4, border: `1px solid ${c}30`, fontFamily: "monospace" }}>{modality}</span>; }
function SeriesCard({ series, stackLength, active, onClick, onDelete }) { return <button onClick={onClick} className="w-full text-left transition-all duration-100" style={{ padding: "8px 10px", background: active ? T.accM : "transparent", borderLeft: `3px solid ${active ? T.acc : "transparent"}`, borderBottom: `1px solid ${T.bg4}` }} onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.bg3; }} onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><div style={{ fontSize: 11, fontWeight: active ? 600 : 500, color: active ? T.t0 : T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{series.description || `Series ${series.seriesNumber ?? "?"}`}</div><div className="flex items-center gap-2 mt-0.5"><ModalityBadge modality={series.modality} /><span style={{ fontSize: 10, color: T.t3 }}>{stackLength} slices</span></div></div>{onDelete && <span onClick={e=>{e.stopPropagation();onDelete();}} title="Remove series" style={{cursor:"pointer",color:T.t4,padding:2,borderRadius:4,flexShrink:0,marginTop:1}} onMouseEnter={e=>{e.currentTarget.style.color=T.red;}} onMouseLeave={e=>{e.currentTarget.style.color=T.t4;}}><IC.Trash /></span>}</div></button>; }
function OverviewPanel({ instance: i, sliceInfo }) { if (!i) return <div style={{ padding: 16, color: T.t3, fontSize: 12 }}>No image</div>; return <div className="space-y-3" style={{ padding: "10px 10px 16px" }}><div style={{ background: T.bg2, borderRadius: 8, padding: "8px 10px", border: `1px solid ${T.bg4}` }}><SectionHead icon={<IC.User />} title="Patient" /><InfoRow label="Name" value={fmtName(i.patientName)} /><InfoRow label="Patient ID" value={i.patientId} /><InfoRow label="Sex / Age" value={[i.patientSex, i.patientAge].filter(Boolean).join(" · ") || "—"} /></div><div style={{ background: T.bg2, borderRadius: 8, padding: "8px 10px", border: `1px solid ${T.bg4}` }}><SectionHead icon={<IC.Activity />} title="Study" /><InfoRow label="Description" value={i.studyDescription} /><InfoRow label="Date" value={fmtDate(i.studyDate)} /><InfoRow label="Institution" value={i.institutionName} /></div><div style={{ background: T.bg2, borderRadius: 8, padding: "8px 10px", border: `1px solid ${T.bg4}` }}><SectionHead icon={<IC.Hash />} title="Image" count={sliceInfo} /><InfoRow label="Modality" value={i.modality} /><InfoRow label="Pixel Spacing" value={i.pixelSpacing || "—"} /></div></div>; }
function TagTablePanel({ instance: inst, tagQ, setTagQ }) { const tags = useMemo(() => { if (!inst?.allTags) return []; const a = Object.entries(inst.allTags).map(([k, v]) => ({ key: k, fmt: fmtTag(k), name: TAG_DICT[k] || "Unknown", vr: v.vr, value: String(v.value ?? "") })); if (!tagQ.trim()) return a; const q = tagQ.toLowerCase(); return a.filter(e => e.fmt.includes(q) || e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)); }, [inst, tagQ]); return <div className="flex flex-col h-full min-h-0"><div style={{ padding: "6px 10px", borderBottom: `1px solid ${T.bg4}` }}><div className="relative"><div className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: T.t3 }}><IC.Search /></div><input type="text" placeholder="Filter…" value={tagQ} onChange={e => setTagQ(e.target.value)} style={{ width: "100%", paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5, borderRadius: 6, fontSize: 11, color: T.t1, background: T.bg2, border: `1px solid ${T.bg4}`, outline: "none" }} /></div></div><div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: `${T.bg5} transparent` }}><table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}><thead><tr>{["Tag", "Name", "Value"].map(h => <th key={h} style={{ position: "sticky", top: 0, background: T.bg1, textAlign: "left", padding: "5px 8px", fontWeight: 600, color: T.t3, borderBottom: `1px solid ${T.bg4}`, zIndex: 1 }}>{h}</th>)}</tr></thead><tbody>{tags.map(r => <tr key={r.key} style={{ borderBottom: `1px solid ${T.bg4}22` }} onMouseEnter={e => e.currentTarget.style.background = `${T.bg3}66`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><td style={{ padding: "3px 8px", fontFamily: "monospace", color: `${T.acc}88`, whiteSpace: "nowrap" }}>{r.fmt}</td><td style={{ padding: "3px 5px", color: T.t2, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td><td style={{ padding: "3px 5px", color: T.t1, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }} title={r.value}>{r.value}</td></tr>)}</tbody></table></div><div style={{ padding: "4px 10px", borderTop: `1px solid ${T.bg4}`, fontSize: 10, color: T.t4 }}>{tags.length} tags</div></div>; }

// ═══════════════════════════════════════════════════════════════════
// MPR VIEWPORT PANEL — V4.1 (orientation-aware)
// ═══════════════════════════════════════════════════════════════════
function MPRViewport({ orientation, vol, stack, isActive, tool, crossPos3D, onActivate, onCrosshairClick, onInstanceReport }) {
  const oriColor = ORI_COLORS[orientation] || T.acc;
  const oriLabel = orientation.charAt(0).toUpperCase() + orientation.slice(1);
  const maxSlice = getSliceCount(vol, orientation, stack);
  const [sliceIdx, setSliceIdx] = useState(() => Math.floor(maxSlice / 2));
  const [vp, setVp] = useState({ zoom: 1, panX: 0, panY: 0, windowCenter: 40, windowWidth: 400 });
  const [presetName, setPresetName] = useState("Auto");
  const [showPresets, setShowPresets] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [activeMeas, setActiveMeas] = useState(null);
  const [selectedMeasId, setSelectedMeasId] = useState(null);
  const [wlInit, setWlInit] = useState(false);
  const cursorRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const ptrRef = useRef({ active: false });
  const isMeasTool = tool === "length" || tool === "angle";
  // Track previous crossPos3D to only sync on genuine changes (prevents feedback loops)
  const prevCrossPosRef = useRef(null);
  // Track the dataset identity to only reset sliceIdx on genuine dataset change
  const prevDatasetRef = useRef(null);

  // Get instance for current slice
  const inst = useMemo(() => {
    if (orientation === "axial") {
      if (!stack || stack.length === 0) return null;
      const idx = Math.max(0, Math.min(stack.length - 1, sliceIdx));
      const s = stack[idx];
      if (!s) { debugLog("VP", `axial inst null: stack[${idx}] missing, stack.length=${stack.length}`); return null; }
      return s;
    }
    if (!vol) return null;
    return extractMPRSlice(vol, orientation, sliceIdx);
  }, [vol, stack, orientation, sliceIdx]);

  // Cine
  const miniDisp = useCallback(a => { if (a.type === "SS") setSliceIdx(Math.max(0, Math.min(maxSlice - 1, a.i))); }, [maxSlice]);
  const cine = useCinePlayer(maxSlice, miniDisp);
  useEffect(() => { cine.si(sliceIdx); }, [sliceIdx, cine.si]);

  // Report instance to parent — throttled during cine to prevent parent re-render cascade.
  // Without throttle: cine at 12fps → setActiveInst(inst) 12x/sec → parent re-renders → ALL 4 viewports re-render.
  const instReportTimerRef = useRef(null);
  useEffect(() => {
    if (!cine.playing) {
      // Not playing cine — report immediately
      if (instReportTimerRef.current) { clearTimeout(instReportTimerRef.current); instReportTimerRef.current = null; }
      onInstanceReport?.(inst);
    } else {
      // During cine — throttle to max ~4 reports/sec to keep metadata panel updated without killing perf
      if (!instReportTimerRef.current) {
        instReportTimerRef.current = setTimeout(() => {
          instReportTimerRef.current = null;
          onInstanceReport?.(instRef.current);
        }, 250);
      }
    }
    return () => { if (instReportTimerRef.current) { clearTimeout(instReportTimerRef.current); instReportTimerRef.current = null; } };
  }, [inst, cine.playing]);

  // Sync from crosshair: when crossPos3D changes, update this viewport's slice.
  // CRITICAL: Only respond to genuine crossPos3D changes (not vol/maxSlice changes)
  // to prevent feedback loops that cause the scrolling bug in large stacks.
  useEffect(() => {
    if (!crossPos3D || !maxSlice) return;
    // Check if crossPos3D actually changed
    const prev = prevCrossPosRef.current;
    if (prev && prev.x === crossPos3D.x && prev.y === crossPos3D.y && prev.z === crossPos3D.z) return;
    prevCrossPosRef.current = crossPos3D;
    let newIdx;
    if (orientation === "axial") newIdx = Math.round(crossPos3D.z);
    else if (orientation === "coronal") newIdx = Math.round(crossPos3D.y);
    else if (orientation === "sagittal") newIdx = Math.round(crossPos3D.x);
    else return;
    const clamped = Math.max(0, Math.min(maxSlice - 1, newIdx));
    setSliceIdx(clamped);
  }, [crossPos3D, orientation, maxSlice]);

  // Auto W/L
  useEffect(() => { if (inst && !wlInit) { const { wc, ww } = computeAutoWL(inst); setVp(v => ({ ...v, windowCenter: wc, windowWidth: ww })); setWlInit(true); setPresetName("Auto"); } }, [inst, wlInit]);
  // Reset sliceIdx only on genuine dataset change (new series/volume), not on vol reference flicker.
  // Track dataset identity by numSlices+rows+cols which uniquely identifies the volume geometry.
  useEffect(() => {
    const id = vol ? `${vol.numSlices}_${vol.rows}_${vol.cols}` : (stack ? `s_${stack.length}` : null);
    if (id === prevDatasetRef.current) return; // same dataset, no reset
    prevDatasetRef.current = id;
    setWlInit(false);
    setSliceIdx(Math.floor(maxSlice / 2));
    setMeasurements([]);
    prevCrossPosRef.current = null; // allow crosshair to re-sync on new dataset
  }, [vol, stack, maxSlice]);

  // 2D crosshair position for this viewport
  // When superiorIsLastSlice, the MPR image row is reversed relative to z:
  //   image_row = numSlices - 1 - z  (Superior at top = row 0 = highest z)
  // So crosshair y-pixel must also be inverted for coronal/sagittal.
  const crosshair2D = useMemo(() => {
    if (!crossPos3D || !vol) return null;
    const { superiorIsLastSlice, numSlices } = vol;
    const zToRow = (z) => superiorIsLastSlice ? (numSlices - 1 - z) : z;
    if (orientation === "axial") return { x: crossPos3D.x, y: crossPos3D.y };
    if (orientation === "coronal") return { x: crossPos3D.x, y: zToRow(crossPos3D.z) };
    if (orientation === "sagittal") return { x: crossPos3D.y, y: zToRow(crossPos3D.z) };
    return null;
  }, [crossPos3D, orientation, vol]);

  // ── Render pipeline: use refs to decouple canvas draw from React reconciliation ──
  // KEY INSIGHT: renderAll was a useCallback depending on [inst, vp, measurements, ...].
  // Every slice change → new inst → new renderAll → ResizeObserver effect teardown/recreate,
  // timeout effect teardown/recreate. That's 3 effect cycles per frame — devastating for perf.
  // Fix: store render data in refs, make renderAll stable, trigger draws imperatively.
  const instRef = useRef(null);     instRef.current = inst;
  const vpRef = useRef(vp);         vpRef.current = vp;
  const measRef = useRef([]);       measRef.current = measurements;
  const activeMeasRef = useRef(null); activeMeasRef.current = activeMeas;
  const selMeasRef = useRef(null);  selMeasRef.current = selectedMeasId;
  const crosshair2DRef = useRef(null); crosshair2DRef.current = crosshair2D;

  const retryRafRef = useRef(null);
  // Stable renderAll — does NOT depend on inst/vp/measurements, reads from refs
  const renderAll = useCallback(() => {
    const c = canvasRef.current, o = overlayRef.current, ct = containerRef.current;
    if (!c || !ct) return;
    const r = ct.getBoundingClientRect();
    const w = Math.floor(r.width), h = Math.floor(r.height);
    if (w < 2 || h < 2) {
      if (retryRafRef.current) cancelAnimationFrame(retryRafRef.current);
      retryRafRef.current = requestAnimationFrame(() => { retryRafRef.current = null; renderAll(); });
      return;
    }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    if (o && (o.width !== w || o.height !== h)) { o.width = w; o.height = h; }
    renderDicomImage(c, instRef.current, vpRef.current);
    const allM = [...measRef.current]; if (activeMeasRef.current) allM.push(activeMeasRef.current);
    if (o) renderOverlay(o, instRef.current, vpRef.current, allM, cursorRef.current, selMeasRef.current, crosshair2DRef.current);
  }, []); // STABLE — no deps, reads from refs

  // Trigger draw when render-relevant data changes (but renderAll itself is stable)
  useEffect(() => { renderAll(); }, [inst, vp, measurements, activeMeas, selectedMeasId, crosshair2D, renderAll]);
  // ResizeObserver — now stable, won't teardown/recreate on every slice
  useEffect(() => { const ct = containerRef.current; if (!ct) return; const ro = new ResizeObserver(() => renderAll()); ro.observe(ct); return () => ro.disconnect(); }, [renderAll]);
  // Safety net for layout timing — also stable
  useEffect(() => { const tid = setTimeout(() => renderAll(), 100); return () => clearTimeout(tid); }, []);

  // Compute 3D crosshair from 2D click
  // The y-axis in coronal/sagittal images is flipped relative to z when superiorIsLastSlice.
  // rowToZ converts the image-row back to the volume z-index.
  const to3D = useCallback((imgX, imgY) => {
    if (!vol) return null;
    const { superiorIsLastSlice, numSlices } = vol;
    const rowToZ = (row) => superiorIsLastSlice ? (numSlices - 1 - row) : row;
    if (orientation === "axial") return { x: imgX, y: imgY, z: sliceIdx };
    if (orientation === "coronal") return { x: imgX, y: sliceIdx, z: rowToZ(imgY) };
    if (orientation === "sagittal") return { x: sliceIdx, y: imgX, z: rowToZ(imgY) };
    return null;
  }, [orientation, sliceIdx, vol]);

  // Pointer handlers
  const onPtrDown = useCallback(e => {
    onActivate?.();
    if (isMeasTool || tool === "crosshair") return;
    const t2 = (e.button === 1 || e.altKey) ? "pan" : tool;
    ptrRef.current = { active: true, tool: t2, sx: e.clientX, sy: e.clientY, svp: { ...vp } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [tool, vp, isMeasTool, onActivate]);

  const onPtrMove = useCallback(e => {
    if (isMeasTool && activeMeas && overlayRef.current && inst) {
      const rect = overlayRef.current.getBoundingClientRect();
      const tf = getTransform(overlayRef.current, inst, vp);
      if (tf) { cursorRef.current = toImage(e.clientX - rect.left, e.clientY - rect.top, tf); renderAll(); }
      return;
    }
    if (tool === "crosshair" && e.buttons === 1 && overlayRef.current && inst) {
      const rect = overlayRef.current.getBoundingClientRect();
      const tf = getTransform(overlayRef.current, inst, vp);
      if (tf) { const pt = toImage(e.clientX - rect.left, e.clientY - rect.top, tf); const p3 = to3D(pt.x, pt.y); if (p3) onCrosshairClick?.(p3); }
      return;
    }
    const s = ptrRef.current; if (!s.active) return;
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
    if (s.tool === "pan") setVp(v => ({ ...v, panX: s.svp.panX + dx, panY: s.svp.panY + dy }));
    else if (s.tool === "zoom") setVp(v => ({ ...v, zoom: Math.max(0.1, Math.min(25, s.svp.zoom * (1 - dy * 0.004))) }));
    else if (s.tool === "wl") { const sens = Math.max(1, s.svp.windowWidth / 300); setVp(v => ({ ...v, windowCenter: s.svp.windowCenter + dy * sens, windowWidth: Math.max(1, s.svp.windowWidth + dx * sens) })); setPresetName("Custom"); }
  }, [isMeasTool, activeMeas, inst, vp, tool, renderAll, to3D, onCrosshairClick]);

  const onPtrUp = useCallback(() => { ptrRef.current.active = false; }, []);

  // Wheel handler for slice navigation — RAF-batched for smooth performance.
  // ROOT CAUSE OF SLUGGISH SCROLLING: The old handler called setSliceIdx on every
  // single wheel event. Trackpads fire 60-120+ events/sec. Each triggers:
  //   setState → re-render → inst useMemo (extractMPRSlice for MPR) → renderAll
  // Crosshair navigation was smoother because it goes through React's batched state
  // updates (parent setCrossPos3D → effect → setSliceIdx, naturally once per frame).
  // FIX: Accumulate wheel delta in a ref, apply once per animation frame.
  const maxSliceRef = useRef(maxSlice);
  maxSliceRef.current = maxSlice;
  const cinePlayingRef = useRef(cine.playing);
  cinePlayingRef.current = cine.playing;
  const wheelAccumRef = useRef(0);
  const wheelRafRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const applyScroll = () => {
      wheelRafRef.current = null;
      const acc = wheelAccumRef.current;
      if (acc === 0) return;
      const delta = acc > 0 ? 1 : -1;
      wheelAccumRef.current = 0;
      const ms = maxSliceRef.current;
      if (ms <= 1) return;
      setSliceIdx(prev => Math.max(0, Math.min(ms - 1, prev + delta)));
    };
    const handler = (e) => {
      e.preventDefault();
      if (cinePlayingRef.current) return;
      if (e.deltaY === 0) return;
      wheelAccumRef.current += e.deltaY;
      // Batch: schedule one update per animation frame
      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(applyScroll);
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
      if (wheelRafRef.current) { cancelAnimationFrame(wheelRafRef.current); wheelRafRef.current = null; }
    };
  }, []); // stable: reads from refs

  const onClick = useCallback(e => {
    onActivate?.();
    if (!overlayRef.current || !inst) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const tf = getTransform(overlayRef.current, inst, vp);
    if (!tf) return;
    const pt = toImage(e.clientX - rect.left, e.clientY - rect.top, tf);
    if (tool === "crosshair") { const p3 = to3D(pt.x, pt.y); if (p3) onCrosshairClick?.(p3); return; }
    // ── Click-to-select existing measurements ──
    // Before starting a new measurement, check if click is near an existing one.
    // Hit-test: check if click is within 8 display pixels of any measurement endpoint.
    if (isMeasTool || tool === "wl" || tool === "pan" || tool === "zoom") {
      const hitRadius = 8; // display pixels
      let hitId = null;
      for (const m of measurements) {
        for (const mp of m.points) {
          const cp = toCanvas(mp.x, mp.y, tf);
          const dx = (e.clientX - rect.left) - cp.x;
          const dy = (e.clientY - rect.top) - cp.y;
          if (Math.sqrt(dx * dx + dy * dy) < hitRadius) { hitId = m.id; break; }
        }
        if (hitId) break;
      }
      if (hitId) {
        setSelectedMeasId(prev => prev === hitId ? null : hitId); // toggle selection
        return; // don't start a new measurement
      }
    }
    // Deselect when clicking away from any measurement
    if (selectedMeasId && !isMeasTool) { setSelectedMeasId(null); return; }
    if (!isMeasTool) return;
    if (!activeMeas) { const m = createMeasurement(tool); m.points.push(pt); setActiveMeas(m); setSelectedMeasId(m.id); }
    else { const m = { ...activeMeas, points: [...activeMeas.points, pt] }; const needed = m.type === "length" ? 2 : 3; if (m.points.length >= needed) { m.done = true; setMeasurements(prev => [...prev, m]); setActiveMeas(null); cursorRef.current = null; } else setActiveMeas(m); }
  }, [isMeasTool, inst, vp, tool, activeMeas, measurements, selectedMeasId, onActivate, to3D, onCrosshairClick]);

  useEffect(() => { if (!isMeasTool && activeMeas) { setActiveMeas(null); cursorRef.current = null; } }, [isMeasTool, activeMeas]);

  // ── Measurement deletion ──────────────────────────────────────────
  const deleteSelectedMeas = useCallback(() => {
    if (!selectedMeasId) return;
    debugLog("MEAS", `Deleting measurement ${selectedMeasId}`);
    setMeasurements(prev => prev.filter(m => m.id !== selectedMeasId));
    setSelectedMeasId(null);
    // If the active (in-progress) measurement is the one being deleted, cancel it
    if (activeMeas && activeMeas.id === selectedMeasId) {
      setActiveMeas(null);
      cursorRef.current = null;
    }
  }, [selectedMeasId, activeMeas]);

  // Keyboard Delete/Backspace to delete selected measurement (only when this viewport is active)
  useEffect(() => {
    if (!isActive) return;
    const handler = (e) => {
      if (e.target.tagName === "INPUT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedMeasId) {
        e.preventDefault();
        deleteSelectedMeas();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, selectedMeasId, deleteSelectedMeas]);

  // W/L Preset handler
  const presets = useMemo(() => getPresetsForModality(inst?.modality), [inst]);
  const applyPreset = useCallback(p => { if (p.wc === null) { if (inst) { const { wc, ww } = computeAutoWL(inst); setVp(v => ({ ...v, windowCenter: wc, windowWidth: ww })); } setPresetName("Auto"); } else { setVp(v => ({ ...v, windowCenter: p.wc, windowWidth: p.ww })); setPresetName(p.n); } setShowPresets(false); }, [inst]);

  const cursor = (isMeasTool || tool === "crosshair") ? "crosshair" : tool === "pan" ? "grab" : tool === "zoom" ? "ns-resize" : "crosshair";

  return (
    <div className="relative overflow-hidden w-full h-full flex flex-col" style={{ background: "#000", border: isActive ? `2px solid ${oriColor}` : `2px solid ${T.bg4}`, borderRadius: 4 }}>
      {/* Orientation badge + W/L preset + measurement delete */}
      <div className="flex items-center justify-between shrink-0 px-2" style={{ height: 22, background: T.bg1, borderBottom: `1px solid ${T.bg4}` }}>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 9, fontWeight: 700, color: oriColor, textTransform: "uppercase", letterSpacing: ".08em" }}>{oriLabel}</span>
          {/* Measurement count + delete button */}
          {measurements.length > 0 && (
            <span style={{ fontSize: 8, color: T.t4, fontFamily: "monospace" }}>{measurements.length}m</span>
          )}
          {selectedMeasId && (
            <button
              onClick={e => { e.stopPropagation(); deleteSelectedMeas(); }}
              title="Delete selected measurement (Del)"
              style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${T.redM}`, cursor: "pointer",
                background: T.redM, color: T.red, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, padding: 0 }}>
              <IC.Trash />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 8, fontFamily: "monospace", color: T.t4 }}>WC:{Math.round(vp.windowCenter)} WW:{Math.round(vp.windowWidth)}</span>
          {/* Inline preset dropdown */}
          <div className="relative">
            <button onClick={e => { e.stopPropagation(); setShowPresets(v => !v); }} style={{ fontSize: 8, padding: "0 4px", borderRadius: 3, background: T.bg2, color: T.t2, border: "none", cursor: "pointer" }}>{presetName} ▾</button>
            {showPresets && (<>
              <div className="fixed inset-0 z-40" onClick={() => setShowPresets(false)} />
              <div className="absolute top-full right-0 mt-1 z-50 rounded-md overflow-hidden shadow-xl" style={{ background: T.bg2, border: `1px solid ${T.bg4}`, minWidth: 130 }}>
                {presets.map(p => (
                  <button key={p.n} onClick={e => { e.stopPropagation(); applyPreset(p); }} className="w-full text-left px-2.5 py-1 text-xs" style={{ color: presetName === p.n ? T.accT : T.t1, background: presetName === p.n ? T.accM : "transparent", display: "flex", justifyContent: "space-between", border: "none", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.bg3} onMouseLeave={e => e.currentTarget.style.background = presetName === p.n ? T.accM : "transparent"}>
                    <span>{p.n}</span>{p.wc !== null && <span style={{ fontSize: 9, fontFamily: "monospace", color: T.t4 }}>{p.wc}/{p.ww}</span>}
                  </button>
                ))}
              </div>
            </>)}
          </div>
        </div>
      </div>
      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ cursor }} onClick={onClick} onPointerDown={onPtrDown} onPointerMove={onPtrMove} onPointerUp={onPtrUp}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />
        {/* Slice counter */}
        {maxSlice > 1 && (
          <div className="absolute bottom-7 right-1.5 pointer-events-none" style={{ textShadow: "0 1px 3px #000" }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: T.t0 }}>{sliceIdx + 1}<span style={{ fontWeight: 400, color: T.t3 }}>/{maxSlice}</span></span>
          </div>
        )}
        {/* CINE CONTROLS — always visible when there are multiple slices */}
        {maxSlice > 1 && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-1.5"
            onPointerDown={e => e.stopPropagation()}
            style={{ height: 26, background: "rgba(6,7,17,0.82)", borderTop: `1px solid ${T.bg4}`, backdropFilter: "blur(4px)" }}>
            {/* Play / Pause */}
            <button
              onClick={e => { e.stopPropagation(); cine.toggle(); }}
              title={cine.playing ? "Pause (Space)" : "Play (Space)"}
              style={{ width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer",
                background: cine.playing ? T.vioM : T.bg3, color: cine.playing ? T.vio : T.t2,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {cine.playing ? <IC.Pause style={{ width: 9, height: 9 }} /> : <IC.Play style={{ width: 9, height: 9 }} />}
            </button>
            {/* Loop toggle */}
            <button
              onClick={e => { e.stopPropagation(); cine.setLoop(l => !l); }}
              title={cine.loop ? "Loop: ON" : "Loop: OFF"}
              style={{ fontSize: 7, fontWeight: 700, padding: "0 4px", height: 16, borderRadius: 3, border: `1px solid ${cine.loop ? T.vioB : T.bg4}`, cursor: "pointer",
                background: cine.loop ? T.vioM : "transparent", color: cine.loop ? T.vio : T.t4 }}>
              ↻
            </button>
            {/* FPS label */}
            <span style={{ fontSize: 8, color: T.t4, fontFamily: "monospace", flexShrink: 0 }}>
              {cine.fps}fps
            </span>
            {/* FPS slider */}
            <input type="range" min={1} max={30} step={1} value={cine.fps}
              onClick={e => e.stopPropagation()}
              onChange={e => { cine.setFps(Number(e.target.value)); }}
              style={{ flex: 1, height: 3, accentColor: T.vio, cursor: "pointer", minWidth: 0 }} />
            {/* Playing indicator dot */}
            {cine.playing && (
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.vio, flexShrink: 0,
                boxShadow: `0 0 4px ${T.vio}`, animation: "pulse 1s ease-in-out infinite" }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 3D VIEWPORT — Adaptive MIP / Compositing volume renderer
// Adaptive quality: coarse during interaction, high-res on idle
// Trilinear-interpolated sampling for smooth appearance
// RAF-based rotation loop for fluid feel
// ═══════════════════════════════════════════════════════════════════
function ThreeDViewport({ vol, isActive, onActivate }) {
  const oriColor = ORI_COLORS["3d"];
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [rotation, setRotation] = useState({ rx: -20, ry: 30 });
  const [projMode, setProjMode] = useState("mip"); // "mip" | "comp"
  const [quality, setQuality] = useState("auto"); // "auto" | "high"
  const rotRef = useRef({ rx: -20, ry: 30 });
  const dragRef = useRef({ active: false, sx: 0, sy: 0, sr: null });
  const rafRef = useRef(null);
  const idleTimerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const renderReqRef = useRef(0);

  // ── Lazy 3D generation state ──────────────────────────────────────
  // 3D ray-marching is the heaviest computation in the app (~50-200ms per frame).
  // Deferring it until explicitly requested prevents it from blocking initial load,
  // scroll smoothness, and cine playback.
  const [is3DGenerated, setIs3DGenerated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Track volume identity to reset 3D state on series change
  const prevVolIdRef = useRef(null);
  const volId = vol ? `${vol.numSlices}_${vol.rows}_${vol.cols}` : null;
  if (volId !== prevVolIdRef.current) {
    prevVolIdRef.current = volId;
    if (is3DGenerated) {
      setIs3DGenerated(false);
      setIsGenerating(false);
    }
  }

  // Volume stats
  const volInfo = useMemo(() => {
    if (!vol) return null;
    const { rows, cols, numSlices, pixelSpacing, sliceSpacing } = vol;
    return {
      rows, cols, numSlices,
      physX: (cols * pixelSpacing[1]).toFixed(1),
      physY: (rows * pixelSpacing[0]).toFixed(1),
      physZ: (numSlices * sliceSpacing).toFixed(1),
    };
  }, [vol]);

  // Auto W/L from volume for display (computed once)
  const volWL = useMemo(() => {
    if (!vol) return { lo: 0, hi: 255 };
    const { volume } = vol;
    const step = Math.max(1, Math.floor(volume.length / 80000));
    let mn = Infinity, mx = -Infinity, sum = 0, cnt = 0;
    for (let i = 0; i < volume.length; i += step) {
      const v = volume[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v; cnt++;
    }
    if (!isFinite(mn)) return { lo: 0, hi: 255 };
    const range = mx - mn || 1;
    const mean = sum / cnt;
    // Clip extremes (bone/air for CT) for better soft tissue window
    return { lo: mn + range * 0.12, hi: mx - range * 0.03, mean, range };
  }, [vol]);

  // Core render function — supports adaptive quality levels
  const doRender = useCallback((lowQuality) => {
    const c = canvasRef.current, ct = containerRef.current;
    if (!c || !ct) return;
    const rect = ct.getBoundingClientRect();
    const cw = Math.floor(rect.width), ch = Math.floor(rect.height);
    if (cw < 2 || ch < 2) return;
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
    if (!vol) return;

    const { volume, rows, cols, numSlices, pixelSpacing, sliceSpacing } = vol;
    const { rx, ry } = rotRef.current;
    const isMip = projMode === "mip";

    // Physical voxel sizes (normalize to avoid distortion)
    const vx = pixelSpacing[1], vy = pixelSpacing[0], vz = sliceSpacing;
    const physW = cols * vx, physH = rows * vy, physD = numSlices * vz;
    const maxPhys = Math.max(physW, physH, physD);

    // Adaptive output resolution
    const baseSize = Math.min(cw, ch);
    const outSize = lowQuality
      ? Math.min(160, baseSize - 8)
      : Math.min(420, baseSize - 8);
    const outW = outSize, outH = outSize;

    // Adaptive sample count
    const diagLen = Math.sqrt(physW**2 + physH**2 + physD**2);
    const minVox = Math.min(vx, vy, vz);
    const maxSamples = lowQuality
      ? Math.min(150, Math.ceil(diagLen / minVox * 0.5))
      : Math.min(500, Math.ceil(diagLen / minVox));

    // Rotation matrices (combined Rx·Ry)
    const crx = Math.cos(rx * Math.PI / 180), srx = Math.sin(rx * Math.PI / 180);
    const cry = Math.cos(ry * Math.PI / 180), sry = Math.sin(ry * Math.PI / 180);

    // View-space axes in volume (physical) space
    // viewX (right) in volume:
    const vxAxisX = cry, vxAxisY = 0, vxAxisZ = sry;
    // viewY (down) in volume:
    const vyAxisX = sry * srx, vyAxisY = crx, vyAxisZ = -cry * srx;
    // viewZ (into screen = ray direction) in volume:
    const vzAxisX = -sry * crx, vzAxisY = srx, vzAxisZ = cry * crx;

    const scale = maxPhys / outSize; // physical mm per output pixel
    const halfW = physW / 2, halfH = physH / 2, halfD = physD / 2;
    const stepMm = diagLen / maxSamples;

    const imgData = ctx.createImageData(outW, outH);
    const rgba = imgData.data;
    const { lo, hi } = volWL;
    const range = hi - lo || 1;

    // Trilinear interpolation helper
    const trilinear = (px, py, pz) => {
      const x0 = px | 0, y0 = py | 0, z0 = pz | 0;
      const x1 = x0 + 1, y1 = y0 + 1, z1 = z0 + 1;
      if (x0 < 0 || x1 >= cols || y0 < 0 || y1 >= rows || z0 < 0 || z1 >= numSlices) return null;
      const fx = px - x0, fy = py - y0, fz = pz - z0;
      const cx2 = 1 - fx, cy2 = 1 - fy, cz2 = 1 - fz;
      const c00 = cx2 * vy + fx * volume[z0 * rows * cols + y0 * cols + x1];
      // full trilinear:
      const i000 = volume[z0 * rows * cols + y0 * cols + x0];
      const i100 = volume[z0 * rows * cols + y0 * cols + x1];
      const i010 = volume[z0 * rows * cols + y1 * cols + x0];
      const i110 = volume[z0 * rows * cols + y1 * cols + x1];
      const i001 = volume[z1 * rows * cols + y0 * cols + x0];
      const i101 = volume[z1 * rows * cols + y0 * cols + x1];
      const i011 = volume[z1 * rows * cols + y1 * cols + x0];
      const i111 = volume[z1 * rows * cols + y1 * cols + x1];
      void c00;
      return (
        i000 * cx2 * cy2 * cz2 +
        i100 * fx  * cy2 * cz2 +
        i010 * cx2 * fy  * cz2 +
        i110 * fx  * fy  * cz2 +
        i001 * cx2 * cy2 * fz  +
        i101 * fx  * cy2 * fz  +
        i011 * cx2 * fy  * fz  +
        i111 * fx  * fy  * fz
      );
    };

    for (let py = 0; py < outH; py++) {
      for (let px = 0; px < outW; px++) {
        // View-space position (centered, in physical mm)
        const vsx = (px - outW * 0.5) * scale;
        const vsy = (py - outH * 0.5) * scale;

        // Ray origin in physical volume space (centered at volume center)
        const ox = vsx * vxAxisX + vsy * vyAxisX + halfW;
        const oy = vsx * vxAxisY + vsy * vyAxisY + halfH;
        const oz = vsx * vxAxisZ + vsy * vyAxisZ + halfD;

        // Ray direction step (in physical mm)
        const dx = vzAxisX * stepMm, dy = vzAxisY * stepMm, dz = vzAxisZ * stepMm;
        const startOffset = -(maxSamples * 0.5);

        let maxVal = -Infinity;
        let accumAlpha = 0, accumR = 0;

        for (let s = 0; s < maxSamples; s++) {
          const t = startOffset + s;
          const px3 = (ox + dx * t) / vx;
          const py3 = (oy + dy * t) / vy;
          const pz3 = (oz + dz * t) / vz;

          if (px3 < 0 || px3 >= cols - 1 || py3 < 0 || py3 >= rows - 1 || pz3 < 0 || pz3 >= numSlices - 1) continue;

          let val;
          if (lowQuality) {
            // Nearest-neighbor for speed during drag
            val = volume[(pz3 | 0) * rows * cols + (py3 | 0) * cols + (px3 | 0)];
          } else {
            val = trilinear(px3, py3, pz3);
            if (val === null) continue;
          }

          if (isMip) {
            if (val > maxVal) maxVal = val;
          } else {
            // Compositing (front-to-back alpha accumulation)
            if (val < lo) continue;
            const norm = Math.min(1, (val - lo) / range);
            // Transfer function: sigmoid-like for better contrast
            const alpha = norm * norm * 0.08;
            const color = norm;
            accumR += (1 - accumAlpha) * color * alpha;
            accumAlpha += (1 - accumAlpha) * alpha;
            if (accumAlpha > 0.98) break;
          }
        }

        let intensity;
        if (isMip) {
          intensity = maxVal <= lo ? 0 : maxVal >= hi ? 255 : ((maxVal - lo) / range) * 255;
          // Subtle gamma for more perceptual depth
          intensity = Math.pow(intensity / 255, 0.85) * 255;
        } else {
          intensity = Math.min(1, accumR / (accumAlpha || 1)) * 255;
        }

        const idx = (py * outW + px) * 4;
        const iv = Math.max(0, Math.min(255, intensity));
        // Tinted grayscale: slight warm tint for MIP, blue-grey for compositing
        if (isMip) {
          rgba[idx]   = Math.min(255, iv * 1.05);
          rgba[idx+1] = iv;
          rgba[idx+2] = Math.max(0, iv * 0.92);
        } else {
          rgba[idx]   = Math.max(0, iv * 0.85);
          rgba[idx+1] = Math.min(255, iv * 0.95);
          rgba[idx+2] = Math.min(255, iv * 1.1);
        }
        rgba[idx+3] = 255;
      }
    }

    const offC = document.createElement("canvas");
    offC.width = outW; offC.height = outH;
    offC.getContext("2d").putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const drawScale = Math.min(cw / outW, ch / outH) * 0.94;
    const dw = outW * drawScale, dh = outH * drawScale;
    ctx.drawImage(offC, (cw - dw) * 0.5, (ch - dh) * 0.5, dw, dh);

    // Info overlay
    ctx.font = "bold 9px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "left";
    ctx.fillText(`${outSize}px · ${maxSamples}spp${lowQuality ? " · drag" : " · HQ"}`, 6, ch - 6);
  }, [vol, projMode, volWL]);

  // RAF render loop for smooth interaction
  const scheduleRender = useCallback((lowQ) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => doRender(lowQ));
  }, [doRender]);

  // Trigger high-quality render after interaction stops
  const scheduleIdleRender = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      isDraggingRef.current = false;
      scheduleRender(false);
    }, 220);
  }, [scheduleRender]);

  useEffect(() => { if (is3DGenerated) scheduleRender(false); }, [scheduleRender, is3DGenerated]);

  useEffect(() => {
    if (!is3DGenerated) return;
    const ct = containerRef.current;
    if (!ct) return;
    const ro = new ResizeObserver(() => scheduleRender(false));
    ro.observe(ct);
    return () => ro.disconnect();
  }, [scheduleRender, is3DGenerated]);

  // Drag to rotate — RAF-driven for fluid feel
  const onPtrDown = useCallback(e => {
    onActivate?.();
    isDraggingRef.current = true;
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, sr: { ...rotRef.current } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [onActivate]);

  const onPtrMove = useCallback(e => {
    const d = dragRef.current;
    if (!d.active) return;
    const newRot = {
      rx: d.sr.rx + (e.clientY - d.sy) * 0.35,
      ry: d.sr.ry + (e.clientX - d.sx) * 0.35,
    };
    rotRef.current = newRot;
    setRotation(newRot); // keep state in sync for display
    scheduleRender(true); // low-quality during drag
    scheduleIdleRender(); // schedule HQ after pause
  }, [scheduleRender, scheduleIdleRender]);

  const onPtrUp = useCallback(() => {
    dragRef.current.active = false;
    // Immediately render HQ on release
    scheduleRender(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, [scheduleRender]);

  // Handle "Generate 3D" button click
  const handleGenerate3D = useCallback(() => {
    if (!vol || is3DGenerated) return;
    setIsGenerating(true);
    debugLog("3D", "Generating 3D view…");
    // Use a short timeout to let the "Generating…" UI paint before heavy work
    setTimeout(() => {
      setIs3DGenerated(true);
      setIsGenerating(false);
      debugLog("3D", "3D generation complete");
    }, 50);
  }, [vol, is3DGenerated]);

  return (
    <div className="relative overflow-hidden w-full h-full flex flex-col"
      style={{ background: "#000", border: isActive ? `2px solid ${oriColor}` : `2px solid ${T.bg4}`, borderRadius: 4 }}
      onClick={onActivate}>
      <div className="flex items-center justify-between shrink-0 px-2"
        style={{ height: 22, background: T.bg1, borderBottom: `1px solid ${T.bg4}` }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: oriColor, textTransform: "uppercase", letterSpacing: ".08em" }}>
          3D {is3DGenerated ? (projMode === "mip" ? "MIP" : "COMP") : ""}
        </span>
        {is3DGenerated && (
          <div className="flex items-center gap-1">
            <button onClick={e => { e.stopPropagation(); setProjMode(p => p === "mip" ? "comp" : "mip"); scheduleRender(false); }}
              style={{ fontSize: 7, padding: "0 5px", height: 14, borderRadius: 3, background: T.bg3, color: T.t2, border: `1px solid ${T.bg4}`, cursor: "pointer" }}>
              {projMode === "mip" ? "→ COMP" : "→ MIP"}
            </button>
            <button onClick={e => { e.stopPropagation(); rotRef.current = { rx: -20, ry: 30 }; setRotation({ rx: -20, ry: 30 }); scheduleRender(false); }}
              style={{ fontSize: 7, padding: "0 4px", height: 14, borderRadius: 3, background: T.bg2, color: T.t3, border: "none", cursor: "pointer" }}>
              ↺
            </button>
          </div>
        )}
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden"
        style={{ cursor: is3DGenerated ? (dragRef.current?.active ? "grabbing" : "grab") : "default" }}
        onPointerDown={is3DGenerated ? onPtrDown : undefined}
        onPointerMove={is3DGenerated ? onPtrMove : undefined}
        onPointerUp={is3DGenerated ? onPtrUp : undefined}
        onPointerLeave={is3DGenerated ? onPtrUp : undefined}>
        {/* Rendered 3D canvas — only visible when generated */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
          style={{ display: is3DGenerated ? "block" : "none" }} />
        {/* HUD overlays — only when generated */}
        {is3DGenerated && volInfo && (
          <div className="absolute bottom-1.5 left-1.5 pointer-events-none"
            style={{ fontSize: 8, fontFamily: "monospace", color: T.t3, lineHeight: 1.5, textShadow: "0 1px 3px #000" }}>
            <div>{volInfo.cols}×{volInfo.rows}×{volInfo.numSlices}</div>
            <div>{volInfo.physX}×{volInfo.physY}×{volInfo.physZ} mm</div>
          </div>
        )}
        {is3DGenerated && (
          <div className="absolute top-1.5 right-1.5 pointer-events-none"
            style={{ fontSize: 8, fontFamily: "monospace", color: `${oriColor}88`, lineHeight: 1.4, textShadow: "0 1px 3px #000", textAlign: "right" }}>
            <div>Rx:{Math.round(rotation.rx)}° Ry:{Math.round(rotation.ry)}°</div>
            <div style={{ fontSize: 7, color: T.t4 }}>Drag to rotate</div>
          </div>
        )}
        {/* ── Placeholder: no volume data ── */}
        {!vol && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div style={{ fontSize: 11, color: T.t3, fontWeight: 600 }}>3D Volume</div>
              <div style={{ fontSize: 9, color: T.t4, marginTop: 4 }}>Load DICOM series for rendering</div>
            </div>
          </div>
        )}
        {/* ── Placeholder: volume ready but 3D not yet generated ── */}
        {vol && !is3DGenerated && !isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center" style={{ maxWidth: 220 }}>
              <div style={{ width: 44, height: 44, margin: "0 auto 12px", borderRadius: 12,
                background: T.bg2, border: `1px solid ${T.bg4}`,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={oriColor} strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div style={{ fontSize: 11, color: T.t2, fontWeight: 600, marginBottom: 4 }}>
                3D model not generated
              </div>
              <div style={{ fontSize: 9, color: T.t4, lineHeight: 1.5, marginBottom: 14 }}>
                Click below to generate the 3D visualization
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleGenerate3D(); }}
                style={{ padding: "7px 20px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                  color: "#fff", background: `linear-gradient(135deg, ${oriColor}, #6366f1)`,
                  border: "none", cursor: "pointer", letterSpacing: ".02em",
                  boxShadow: `0 2px 8px ${oriColor}44` }}>
                Generate 3D
              </button>
              {volInfo && (
                <div style={{ fontSize: 8, color: T.t4, fontFamily: "monospace", marginTop: 10 }}>
                  {volInfo.cols}×{volInfo.rows}×{volInfo.numSlices} · {volInfo.physX}×{volInfo.physY}×{volInfo.physZ} mm
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── Loading state: generating 3D ── */}
        {vol && isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div style={{ width: 36, height: 36, margin: "0 auto 12px", borderRadius: "50%",
                border: `2px solid ${oriColor}`, borderTopColor: "transparent",
                animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 11, color: T.t2, fontWeight: 600 }}>Generating 3D…</div>
              <div style={{ fontSize: 9, color: T.t4, marginTop: 4 }}>This may take a moment</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP — V4.1
// ═══════════════════════════════════════════════════════════════════
export default function DicomViewerApp() {
  const [state, dispatch] = useReducer(reducer, INIT_STATE);
  const [tool, setTool] = useState("wl");
  const [showMeta, setShowMeta] = useState(true);
  const [showSide, setShowSide] = useState(true);
  const [metaTab, setMetaTab] = useState("overview");
  const [tagQ, setTagQ] = useState("");
  const [drag, setDrag] = useState(false);
  const [gridMode, setGridMode] = useState(4); // 1 or 4
  const [activeSeriesUid, setActiveSeriesUid] = useState(null);
  const [crossPos3D, setCrossPos3D] = useState(null);
  const [activeVpOri, setActiveVpOri] = useState("axial");
  const [activeInst, setActiveInst] = useState(null);
  const fileRef = useRef(null);

  const seriesList = useMemo(() => { const a = []; for (const st of Object.values(state.studies)) for (const sr of Object.values(st.series)) a.push({ ...sr, studyUid: st.uid }); a.sort((x, y) => (x.seriesNumber ?? 999) - (y.seriesNumber ?? 999)); return a; }, [state.studies]);
  const hasData = seriesList.length > 0;
  const firstStudy = Object.values(state.studies)[0];

  // Auto-select first series — SYNCHRONOUS via useMemo to prevent empty-stack render frame.
  // The old useEffect approach caused a render with activeSeriesUid=null → activeStack=[] → "No pixel data"
  // before the effect could fire. useMemo makes the selection immediate.
  const effectiveSeriesUid = useMemo(() => {
    if (activeSeriesUid && state.stacks[activeSeriesUid]) return activeSeriesUid;
    if (seriesList.length > 0) return seriesList[0].uid;
    return null;
  }, [activeSeriesUid, seriesList, state.stacks]);

  const activeStack = effectiveSeriesUid ? state.stacks[effectiveSeriesUid] || [] : [];
  const activeSeriesInfo = seriesList.find(s => s.uid === effectiveSeriesUid);

  // Build volume from active stack — wrapped in try-catch for robustness
  const volBuildResultRef = useRef({ vol: null, error: null });
  const vol = useMemo(() => {
    if (!activeStack || activeStack.length < 3) { volBuildResultRef.current = { vol: null, error: null }; return null; }
    try {
      const t0 = performance.now();
      const v = buildVolume(activeStack);
      const dt = performance.now() - t0;
      debugLog("VOLUME", `buildVolume completed in ${dt.toFixed(0)}ms → ${v ? "success" : "null"}`);
      volBuildResultRef.current = { vol: v, error: null };
      return v;
    } catch (e) {
      debugLog("VOLUME", `❌ buildVolume CRASHED: ${e.message}`);
      volBuildResultRef.current = { vol: null, error: e.message };
      return null;
    }
  }, [activeStack]);
  const mprAvailable = vol !== null;

  // File processing — PRESERVED (with added instrumentation)
  const processFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f => { const n = f.name.toLowerCase(); return n.endsWith(".dcm") || (f.size > 500 && !n.match(/\.(jpg|jpeg|png|gif|bmp|txt|pdf|xml|html|json|csv|zip|gz|tar|js|css|py)$/i)); });
    if (!files.length) { dispatch({ type: "ERROR", msg: "No DICOM files found." }); return; }
    dispatch({ type: "LOAD_START", total: files.length });
    const newStudies = { ...state.studies }; const byS = {};
    let parseOk=0,parseFail=0,compressedCount=0,noPixelCount=0;
    for (let i = 0; i < files.length; i++) {
      try {
        const p = new DicomParser(await files[i].arrayBuffer()).parse();
        const su = p.studyInstanceUid || "unknown-study", se = p.seriesInstanceUid || "unknown-series";
        if (!newStudies[su]) newStudies[su] = { uid: su, patientName: p.patientName, patientId: p.patientId, patientBirthDate: p.patientBirthDate, patientSex: p.patientSex, patientAge: p.patientAge, studyDate: p.studyDate, studyTime: p.studyTime, studyDescription: p.studyDescription, institutionName: p.institutionName, series: {} };
        if (!newStudies[su].series[se]) newStudies[su].series[se] = { uid: se, seriesNumber: p.seriesNumber, description: p.seriesDescription || `Series ${p.seriesNumber ?? "?"}`, modality: p.modality, instanceCount: 0 };
        newStudies[su].series[se].instanceCount++;
        if (!byS[se]) byS[se] = []; byS[se].push(p);
        parseOk++;
        if(p.isCompressed||p.isEncapsulated)compressedCount++;
        if(!p.pixelData)noPixelCount++;
        // Log first instance details for debugging
        if(i===0)debugLog("PARSE",`First instance: ${p.rows}×${p.cols} ba=${p.bitsAllocated} spp=${p.samplesPerPixel} ts=${p.transferSyntax} compressed=${p.isCompressed} hasPixelData=${!!p.pixelData} pdLen=${p.pixelData?.length||0}`);
      } catch (e) { parseFail++;debugLog("PARSE",`Failed to parse ${files[i].name}: ${e.message}`); }
      if ((i + 1) % 5 === 0 || i === files.length - 1) dispatch({ type: "LOAD_PROGRESS", loaded: i + 1 });
    }
    debugLog("PARSE",`Parse summary: ${parseOk} ok, ${parseFail} failed, ${compressedCount} compressed, ${noPixelCount} missing pixelData`);
    if(compressedCount>0&&noPixelCount>0)debugLog("PARSE",`⚠️ ${compressedCount} slices use compressed transfer syntax — pixelData will be null for these`);
    const ns = { ...state.stacks }; for (const [uid, ins] of Object.entries(byS)) { ns[uid] = buildImageStack([...(ns[uid] || []), ...ins]); const s2 = Object.values(newStudies).find(s => s.series[uid]); if (s2?.series[uid]) s2.series[uid].instanceCount = ns[uid].length; }
    dispatch({ type: "LOAD_DONE", payload: { studies: newStudies, stacks: ns } });
  }, [state.studies, state.stacks]);

  // Keyboard shortcuts
  useEffect(() => {
    const fn = e => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "1") setTool("wl"); else if (e.key === "2") setTool("pan"); else if (e.key === "3") setTool("zoom");
      else if (e.key === "l" || e.key === "L") setTool("length"); else if (e.key === "a" || e.key === "A") setTool("angle");
      else if (e.key === "c" || e.key === "C") setTool("crosshair");
      else if (e.key === "g" || e.key === "G") setGridMode(p => p === 1 ? 4 : 1);
      else if (e.key === "m" || e.key === "M") setShowMeta(v => !v);
      else if (e.key === "Escape") { setTool("wl"); setCrossPos3D(null); }
    };
    window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn);
  }, []);

  const handleDrop = useCallback(e => { e.preventDefault(); setDrag(false); const items = e.dataTransfer?.items; if (items) { const ps = []; for (let i = 0; i < items.length; i++) { const entry = items[i].webkitGetAsEntry?.(); if (entry) ps.push(traverseEntry(entry)); else if (items[i].kind === "file") { const f = items[i].getAsFile(); if (f) ps.push(Promise.resolve([f])); } } Promise.all(ps).then(r => { const all = r.flat().filter(Boolean); if (all.length) processFiles(all); }); } else if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files); }, [processFiles]);

  const orientations = gridMode === 4 ? ["axial", "coronal", "sagittal", "3d"] : ["axial"];

  // ── Stable callback factories for MPRViewport props ──
  // Without this: inline arrows in JSX create new references every render
  // → every parent re-render causes all 4 viewports to receive "new" props
  // → React reconciles all 4 even if nothing actually changed for them.
  const activeVpOriRef = useRef(activeVpOri); activeVpOriRef.current = activeVpOri;
  const stableActivators = useRef({});
  const stableReporters = useRef({});
  for (const ori of ["axial", "coronal", "sagittal", "3d"]) {
    if (!stableActivators.current[ori]) stableActivators.current[ori] = () => setActiveVpOri(ori);
    if (!stableReporters.current[ori]) stableReporters.current[ori] = (inst) => { if (activeVpOriRef.current === ori) setActiveInst(inst); };
  }

  return (
    <div className="flex flex-col w-full h-screen select-none overflow-hidden" style={{ background: T.bg0, fontFamily: "'Outfit','DM Sans',system-ui,sans-serif", color: T.t1 }} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={e => { if (e.currentTarget.contains(e.relatedTarget)) return; setDrag(false); }} onDrop={handleDrop}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* TOOLBAR */}
      <header className="flex items-center h-11 px-2 gap-0.5 shrink-0 flex-wrap" style={{ background: T.bg1, borderBottom: `1px solid ${T.bg4}` }}>
        <div className="flex items-center gap-2 mr-1.5">
          <div style={{ width: 24, height: 24, borderRadius: 6, background: `linear-gradient(135deg,${T.acc},#6366f1)`, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg></div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.t0 }}>DICOM<span style={{ fontWeight: 400, color: T.t3, marginLeft: 3 }}>Viewer</span></span>
        </div>
        <ToolSep />
        <ToolBtn icon={<IC.Upload />} label="Import" onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" multiple accept=".dcm,.DCM,*/*" className="hidden" onChange={e => { if (e.target.files.length) processFiles(e.target.files); e.target.value = ""; }} {...{ webkitdirectory: "" }} />

        {hasData && (<>
          <ToolSep />
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: T.bg2 }}>
            <ToolBtn active={tool === "wl"} icon={<IC.Contrast />} label="W/L" shortcut="1" onClick={() => setTool("wl")} />
            <ToolBtn active={tool === "pan"} icon={<IC.Move />} label="Pan" shortcut="2" onClick={() => setTool("pan")} />
            <ToolBtn active={tool === "zoom"} icon={<IC.ZoomIn />} label="Zoom" shortcut="3" onClick={() => setTool("zoom")} />
          </div>
          <ToolSep />
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: T.bg2 }}>
            <MeasBtn active={tool === "length"} icon={<IC.Ruler />} label="Length" shortcut="L" color={T.grn} colorM={T.grnM} colorB={T.grnB} onClick={() => setTool(tool === "length" ? "wl" : "length")} />
            <MeasBtn active={tool === "angle"} icon={<IC.Angle />} label="Angle" shortcut="A" color={T.org} colorM={T.orgM} colorB={T.orgB} onClick={() => setTool(tool === "angle" ? "wl" : "angle")} />
            <MeasBtn active={tool === "crosshair"} icon={<IC.Crosshair />} label="XHair" shortcut="C" color={T.yel} colorM={T.yelM} colorB={T.yelB} onClick={() => setTool(tool === "crosshair" ? "wl" : "crosshair")} />
          </div>
          <ToolSep />
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: T.bg2 }}>
            <ToolBtn active={gridMode === 1} icon={<IC.Grid1x1 />} label="" onClick={() => setGridMode(1)} title="Single (G)" />
            <ToolBtn active={gridMode === 4} icon={<IC.Grid2x2 />} label={mprAvailable ? "MPR" : ""} onClick={() => setGridMode(4)} title="MPR 2×2 (G)" />
          </div>
          {!mprAvailable && gridMode === 4 && <span style={{ fontSize: 9, color: T.red, marginLeft: 4 }}>Need ≥3 uniform slices for MPR</span>}
          <ToolSep />
          <ToolBtn icon={<IC.Reset />} label="Reset" onClick={() => { setTool("wl"); setCrossPos3D(null); }} />
          <ToolSep />
          <ToolBtn active={showSide} icon={<IC.SidePanel />} label="" onClick={() => setShowSide(v => !v)} />
          <ToolBtn active={showMeta} icon={<IC.RightPanel />} label="Tags" shortcut="M" onClick={() => setShowMeta(v => !v)} />

          <div className="ml-auto flex items-center gap-1" style={{ fontFamily: "monospace" }}>
            {gridMode === 4 && mprAvailable && <span style={{ fontSize: 9, color: ORI_COLORS[activeVpOri], padding: "2px 6px", background: `${ORI_COLORS[activeVpOri]}18`, borderRadius: 4, fontWeight: 600, textTransform: "uppercase" }}>{activeVpOri}</span>}
            {crossPos3D && <span style={{ fontSize: 9, color: T.yel, padding: "2px 6px", background: T.yelM, borderRadius: 4 }}>XHAIR</span>}
            <span style={{ fontSize: 10, color: T.acc, fontWeight: 600, padding: "2px 8px", background: T.accM, borderRadius: 4, border: `1px solid ${T.accB}` }}>{activeStack.length} slices</span>
          </div>
        </>)}
      </header>

      {/* BODY */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT SIDEBAR */}
        {hasData && showSide && (
          <aside className="flex flex-col shrink-0 overflow-hidden" style={{ width: 200, background: T.bg1, borderRight: `1px solid ${T.bg4}` }}>
            <div className="flex items-center justify-between px-3 h-8 shrink-0" style={{ borderBottom: `1px solid ${T.bg4}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: T.t3 }}>Series</span>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: `${T.bg5} transparent` }}>
              {seriesList.map(s => <SeriesCard key={s.uid} series={s} stackLength={state.stacks[s.uid]?.length || 0} active={s.uid === effectiveSeriesUid} onClick={() => { setActiveSeriesUid(s.uid); setCrossPos3D(null); }} onDelete={() => { dispatch({ type: "DELETE_SERIES", uid: s.uid }); if (effectiveSeriesUid === s.uid) setActiveSeriesUid(null); setCrossPos3D(null); }} />)}
            </div>
            {firstStudy && <div className="shrink-0" style={{ padding: "8px 10px", borderTop: `1px solid ${T.bg4}`, background: T.bg2 }}><div style={{ fontSize: 11, fontWeight: 600, color: T.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtName(firstStudy.patientName)}</div><div style={{ fontSize: 10, color: T.t3, marginTop: 1 }}>{firstStudy.patientId || "—"}</div></div>}
          </aside>
        )}

        {/* CENTER */}
        <main className="flex-1 flex flex-col min-w-0" style={{ background: T.bg0 }}>
          {!hasData ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div style={{ maxWidth: 400, width: "100%", borderRadius: 16, border: `2px dashed ${drag ? T.acc : T.bg5}`, background: drag ? T.accM : T.bg1, padding: "48px 32px", textAlign: "center", transition: "all 0.2s" }}>
                {state.isLoading ? (<div className="space-y-4"><div style={{ width: 40, height: 40, margin: "0 auto", borderRadius: "50%", border: `2px solid ${T.acc}`, borderTopColor: "transparent", animation: "spin 1s linear infinite" }} /><p style={{ fontSize: 13, color: T.t2 }}>Parsing DICOM files…</p><div style={{ width: "100%", height: 4, borderRadius: 2, background: T.bg4, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 2, background: T.acc, transition: "width 0.2s", width: `${state.loadProgress.total ? (state.loadProgress.loaded / state.loadProgress.total) * 100 : 0}%` }} /></div></div>
                ) : (<><div style={{ width: 56, height: 56, margin: "0 auto 20px", borderRadius: 14, background: T.bg2, border: `1px solid ${T.bg4}`, display: "flex", alignItems: "center", justifyContent: "center" }}><IC.Layers style={{ color: T.t3 }} /></div><h3 style={{ fontSize: 17, fontWeight: 700, color: T.t0, marginBottom: 6 }}>Import DICOM Files</h3><p style={{ fontSize: 12, color: T.t3, lineHeight: 1.6, marginBottom: 24 }}>Drag & drop .dcm files or folders</p><button onClick={() => fileRef.current?.click()} style={{ padding: "9px 28px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", background: `linear-gradient(135deg,${T.acc},#6366f1)`, border: "none", cursor: "pointer" }}>Browse Files</button>{state.error && <div style={{ marginTop: 16, padding: "8px 12px", borderRadius: 8, fontSize: 11, color: T.red, background: T.redM }}>{state.error}</div>}</>)}
              </div>
            </div>
          ) : (
            <div className="flex-1" style={{ display: "grid", gridTemplateColumns: gridMode === 4 ? "1fr 1fr" : "1fr", gridTemplateRows: gridMode === 4 ? "1fr 1fr" : "1fr", gap: 2, padding: 2 }}>
              {orientations.map(ori => (
                ori === "3d" ? (
                  <ThreeDViewport
                    key="3d"
                    vol={mprAvailable ? vol : null}
                    isActive={activeVpOri === "3d"}
                    onActivate={stableActivators.current["3d"]}
                  />
                ) : (
                  <MPRViewport
                    key={ori}
                    orientation={ori}
                    vol={mprAvailable ? vol : null}
                    stack={activeStack}
                    isActive={activeVpOri === ori}
                    tool={tool}
                    crossPos3D={crossPos3D}
                    onActivate={stableActivators.current[ori]}
                    onCrosshairClick={setCrossPos3D}
                    onInstanceReport={stableReporters.current[ori]}
                  />
                )
              ))}
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        {hasData && showMeta && (
          <aside className="flex flex-col shrink-0 overflow-hidden" style={{ width: 270, background: T.bg1, borderLeft: `1px solid ${T.bg4}` }}>
            <div className="flex items-center shrink-0 px-1" style={{ height: 34, borderBottom: `1px solid ${T.bg4}`, gap: 2 }}>
              {[["overview", "Overview"], ["tags", "DICOM Tags"]].map(([id, label]) => <button key={id} onClick={() => setMetaTab(id)} style={{ flex: 1, padding: "5px 6px", fontSize: 11, fontWeight: metaTab === id ? 600 : 500, color: metaTab === id ? T.t0 : T.t3, background: metaTab === id ? T.bg3 : "transparent", borderRadius: 6, border: "none", cursor: "pointer" }}>{label}</button>)}
              <button onClick={() => setShowMeta(false)} style={{ padding: 4, color: T.t3, cursor: "pointer", borderRadius: 4, background: "transparent", border: "none" }}><IC.X /></button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "thin", scrollbarColor: `${T.bg5} transparent` }}>
              {metaTab === "overview" ? <OverviewPanel instance={activeInst} sliceInfo={`${activeStack.length} slices`} /> : <TagTablePanel instance={activeInst} tagQ={tagQ} setTagQ={setTagQ} />}
            </div>
          </aside>
        )}
      </div>

      {drag && <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)" }}><div className="text-center"><div style={{ width: 60, height: 60, margin: "0 auto 16px", borderRadius: 16, border: `2px dashed ${T.acc}55`, display: "flex", alignItems: "center", justifyContent: "center" }}><IC.Upload style={{ color: T.acc }} /></div><p style={{ fontSize: 16, fontWeight: 700, color: T.accT }}>Drop DICOM files here</p></div></div>}
    </div>
  );
}
