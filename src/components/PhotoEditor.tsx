"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Download, Scissors, Wand2, RefreshCcw, Loader2, ArrowLeft, Check } from "lucide-react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { removeBackground } from "@imgly/background-removal";

interface PhotoEditorProps {
  imageSrc: string;
  onReset: () => void;
}

const PRESETS = [
  { label: '1.2" x 1.5"', width: 1.2, height: 1.5, aspect: 1.2 / 1.5 },
  { label: '4" x 6"', width: 4, height: 6, aspect: 4 / 6 },
  { label: 'Square', aspect: 1 },
  { label: 'Free', aspect: undefined },
];

const BG_COLORS = [
  { name: 'Transparent', value: 'transparent' },
  { name: 'White', value: '#ffffff' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Grey', value: '#64748b' },
  { name: 'Custom', value: 'custom' },
];

export default function PhotoEditor({ imageSrc, onReset }: PhotoEditorProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(1.2 / 1.5);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [isCropping, setIsCropping] = useState(true);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState('transparent');
  const [customColor, setCustomColor] = useState('#ffffff');
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setProcessedImage(imageSrc);
  }, [imageSrc]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height), width, height));
    }
  }

  const applyCrop = async () => {
    if (!imgRef.current || !completedCrop) return;
    setIsApplyingCrop(true);

    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );

    const croppedBase64 = canvas.toDataURL("image/png");
    setProcessedImage(croppedBase64);
    setCrop(undefined); // Reset crop selection after applying
    setCompletedCrop(undefined);
    setIsApplyingCrop(false);
    setIsCropping(false);
    
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.8 }
    });
  };

  const startCropping = () => {
    setIsCropping(true);
    // Force re-initialization of crop selection
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect || 1, width, height), width, height));
    }
  };

  const handleDownload = async () => {
    // If there's an active crop, apply it to the download
    // Otherwise download the current processed image
    const imageToDownload = new Image();
    imageToDownload.src = processedImage || "";
    
    await new Promise((resolve) => {
      imageToDownload.onload = resolve;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = imageToDownload.width;
    let height = imageToDownload.height;
    let startX = 0;
    let startY = 0;

    if (imgRef.current && completedCrop) {
      const scaleX = imageToDownload.width / imgRef.current.width;
      const scaleY = imageToDownload.height / imgRef.current.height;
      width = completedCrop.width * scaleX;
      height = completedCrop.height * scaleY;
      startX = completedCrop.x * scaleX;
      startY = completedCrop.y * scaleY;
    }

    canvas.width = width;
    canvas.height = height;

    const fillValue = bgColor === 'custom' ? customColor : bgColor;
    if (fillValue !== 'transparent') {
      ctx.fillStyle = fillValue;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(
      imageToDownload,
      startX,
      startY,
      width,
      height,
      0,
      0,
      width,
      height
    );

    const base64Image = canvas.toDataURL("image/jpeg", 0.9);
    const link = document.createElement("a");
    link.download = `studio-photo-${Date.now()}.jpg`;
    link.href = base64Image;
    link.click();
    
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleRemoveBackground = async () => {
    if (!processedImage) return;
    setIsRemovingBg(true);
    try {
      const blob = await removeBackground(processedImage, {
        model: "isnet_fp16", // Official high-speed fp16 model
        progress: (status, progress) => {
          console.log(`${status}: ${progress}`);
        }
      });
      const url = URL.createObjectURL(blob);
      setProcessedImage(url);
    } catch (error) {
      console.error("Background removal failed:", error);
      alert("Background removal failed. This might be due to hardware limitations or image complexity.");
    } finally {
      setIsRemovingBg(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start max-w-6xl mx-auto p-4">
      <div className="flex-1 glass rounded-3xl p-6 overflow-hidden w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onReset}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Back to Upload"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Scissors className="w-5 h-5 text-primary" />
              Photo Studio
            </h2>
          </div>
          <button
            onClick={() => setProcessedImage(imageSrc)}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            <RefreshCcw className="w-4 h-4" /> Reset All
          </button>
        </div>

        <div className="relative bg-slate-200 rounded-xl overflow-hidden flex justify-center items-center min-h-[400px]">
          {isCropping ? (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              className="max-h-[600px] relative z-10"
            >
              <img
                ref={imgRef}
                src={processedImage || ""}
                alt="To Crop"
                onLoad={onImageLoad}
                className="max-w-full h-auto transition-colors duration-300"
                style={{ 
                  backgroundColor: bgColor === 'custom' ? customColor : bgColor === 'transparent' ? 'transparent' : bgColor 
                }}
              />
            </ReactCrop>
          ) : (
            <img
              src={processedImage || ""}
              alt="Processed"
              className="max-w-full h-auto max-h-[600px] transition-colors duration-300 relative z-10"
              style={{ 
                backgroundColor: bgColor === 'custom' ? customColor : bgColor === 'transparent' ? 'transparent' : bgColor 
              }}
            />
          )}
        </div>
      </div>

      <div className="w-full lg:w-80 flex flex-col gap-6">
        {/* Crop Controls */}
        <div className="glass rounded-3xl p-6">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">1. Crop & Resize</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setAspect(p.aspect);
                  if (!isCropping) startCropping();
                }}
                className={`p-3 rounded-xl border transition-all text-sm font-medium ${
                  aspect === p.aspect
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-slate-50 border-slate-300 text-slate-600 hover:border-slate-400"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {isCropping ? (
            <button
              onClick={applyCrop}
              disabled={!completedCrop || isApplyingCrop}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-30"
            >
              {isApplyingCrop ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Apply Crop
            </button>
          ) : (
            <button
              onClick={startCropping}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              <Scissors className="w-4 h-4" />
              Crop
            </button>
          )}
        </div>

        {/* AI Tools */}
        <div className="glass rounded-3xl p-6">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">2. AI Magic</h3>
          <button
            onClick={handleRemoveBackground}
            disabled={isRemovingBg}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50"
          >
            {isRemovingBg ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </div>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                <span>Remove Background</span>
              </>
            )}
          </button>
        </div>

        {/* Background Color */}
        <div className="glass rounded-3xl p-6">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">3. Background</h3>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {BG_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setBgColor(c.value)}
                title={c.name}
                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center overflow-hidden ${
                  bgColor === c.value ? "border-primary scale-110 shadow-md" : "border-slate-200"
                }`}
                style={{ 
                  backgroundColor: c.value === 'transparent' ? 'transparent' : (c.value === 'custom' ? customColor : c.value) 
                }}
              >
                {c.value === 'transparent' && (
                  <div className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] opacity-10" />
                )}
              </button>
            ))}
          </div>
          {bgColor === 'custom' && (
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-full h-10 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer"
            />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleDownload}
            className="w-full py-5 rounded-2xl bg-slate-900 text-white font-extrabold text-lg flex items-center justify-center gap-2 hover:bg-slate-800 hover:scale-[1.02] transition-all active:scale-[0.98] shadow-xl"
          >
            <Download className="w-6 h-6" />
            Download Studio JPG
          </button>
          
          <button
            onClick={onReset}
            className="w-full py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-medium text-sm flex items-center justify-center gap-2 hover:bg-slate-200 hover:text-slate-700 transition-all"
          >
            <RefreshCcw className="w-4 h-4" />
            Upload Another Photo
          </button>
        </div>
      </div>
    </div>
  );
}
