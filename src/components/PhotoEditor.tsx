"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Download, Scissors, Wand2, RefreshCcw, Loader2, ArrowLeft, Check, Scale, ImagePlus, ChevronDown, Camera, Lock, Sliders } from "lucide-react";
import { removeBackground } from "@imgly/background-removal";
import { dataUrlWithDpi } from "@/lib/imageDpi";

interface PhotoEditorProps {
  imageSrc: string;
  onReset: () => void;
}

// DPI used for exports when no fixed physical print size is selected.
const PRINT_DPI = 300;

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

type ModelId = "isnet_quint8" | "isnet_fp16" | "isnet";

// Background-removal models, ordered fastest -> highest quality. Bigger models download more on the
// first run (then cached) and take longer per image, but leave less background behind.
const MODELS: { id: ModelId; label: string; size: string; desc: string }[] = [
  { id: "isnet_quint8", label: "Fast", size: "~40MB", desc: "Quickest, works on low-end devices, can leave artifacts" },
  { id: "isnet_fp16", label: "Balanced", size: "~80MB", desc: "Recommended — clean edges, good speed" },
  { id: "isnet", label: "Best", size: "~170MB", desc: "Sharpest result, slowest, needs more memory" },
];

// Helper utility to resize high-resolution images to a max width/height before running
// local WASM background removal. The ISNet model works internally at ~1024px, so feeding it
// roughly that resolution keeps the mask as detailed as the model allows while avoiding the
// huge multi-megapixel inputs that make inference crawl. We export lossless PNG so we don't
// bake compression artifacts into the data the model sees.
const resizeImageForWasm = (base64OrBlobUrl: string, maxDimension: number = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64OrBlobUrl;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxDimension && height <= maxDimension) {
        resolve(base64OrBlobUrl);
        return;
      }

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64OrBlobUrl);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      // Fallback to original image if resizing fails
      resolve(base64OrBlobUrl);
    };
  });
};

export default function PhotoEditor({ imageSrc, onReset }: PhotoEditorProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(1.2 / 1.5);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState(0);
  const bgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(imageSrc);
  const [bgColor, setBgColor] = useState('transparent');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [backgroundImageSrc, setBackgroundImageSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Resizer state parameters
  const [resizeWidth, setResizeWidth] = useState<number>(0);
  const [resizeHeight, setResizeHeight] = useState<number>(0);
  const [resizePercentage, setResizePercentage] = useState<number>(100);
  const [originalWidth, setOriginalWidth] = useState<number>(0);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState<boolean>(true);
  const [originalRatio, setOriginalRatio] = useState<number>(1);
  const [estimatedSizeKB, setEstimatedSizeKB] = useState<number>(0);

  // Physical print size the current crop is meant to be, in inches. Used to embed the
  // correct DPI in the exported file so it prints at the right size (e.g. in CorelDRAW).
  // null = no fixed physical size (Square / Free / pixel crops) -> falls back to PRINT_DPI.
  const [targetInches, setTargetInches] = useState<{ w: number; h: number } | null>({
    w: 1.2,
    h: 1.5,
  });

  // Adjustment sliders
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // Custom crop size inputs
  const [customCropUnit, setCustomCropUnit] = useState<'in' | 'cm' | 'px'>('in');
  const [customCropWidth, setCustomCropWidth] = useState<string>('1.5');
  const [customCropHeight, setCustomCropHeight] = useState<string>('2.0');
  const [isCustomCropOpen, setIsCustomCropOpen] = useState(false);

  // Black outline option parameters
  const [outlineWidth, setOutlineWidth] = useState<number>(0);
  const [outlineColor, setOutlineColor] = useState<string>('#000000');
  const [cornerRadius, setCornerRadius] = useState<number>(0);
  const [cardShadow, setCardShadow] = useState<string>('none');

  // Clear the background-removal progress timer if the component unmounts mid-run.
  useEffect(() => {
    return () => {
      if (bgTimerRef.current) clearInterval(bgTimerRef.current);
    };
  }, []);

  // Export options. PNG = lossless / keeps transparency, JPEG = smaller files with adjustable quality.
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('jpeg');
  const [jpegQuality, setJpegQuality] = useState<number>(95);

  // A transparent background can only be preserved in PNG, so JPEG is meaningless there.
  const effectiveFormat: 'png' | 'jpeg' = bgColor === 'transparent' ? 'png' : exportFormat;

  // Background-removal model selection, gated behind a server-verified password.
  const [selectedModel, setSelectedModel] = useState<ModelId>("isnet_fp16");
  const [isModelUnlocked, setIsModelUnlocked] = useState(false);
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [modelPasswordInput, setModelPasswordInput] = useState("");
  const [modelError, setModelError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Restore the unlocked state from the signed (httpOnly) session cookie after a reload.
  useEffect(() => {
    let active = true;
    fetch("/api/unlock-model")
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.unlocked) setIsModelUnlocked(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnlocking) return;
    setIsUnlocking(true);
    setModelError("");
    try {
      const res = await fetch("/api/unlock-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: modelPasswordInput }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setIsModelUnlocked(true);
        setModelPasswordInput("");
      } else {
        setModelError(data?.error || "Incorrect password.");
      }
    } catch {
      setModelError("Could not reach the server. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  };

  // Keep track of dimensions and compute original parameters on base64 change
  useEffect(() => {
    if (!processedImage) return;
    const img = new Image();
    img.src = processedImage;
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setResizeWidth(w);
      setResizeHeight(h);
      setOriginalWidth(w);
      setResizePercentage(100);
      setOriginalRatio(w / h);
    };
  }, [processedImage]);

  // Dynamically update resizer pixel dimensions when crop bounds are adjusted!
  useEffect(() => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current;
    
    // Scale from display size to natural high-res image coordinates
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    const cropW = Math.round(completedCrop.width * scaleX);
    const cropH = Math.round(completedCrop.height * scaleY);
    
    if (cropW && cropH) {
      setResizeWidth(cropW);
      setResizeHeight(cropH);
      setOriginalWidth(cropW);
      setOriginalRatio(cropW / cropH);
      setResizePercentage(100);
    }
  }, [completedCrop]);

  // Dynamically calculate exact JPEG size of current settings!
  useEffect(() => {
    if (!processedImage || !resizeWidth || !resizeHeight) return;

    // Debounce computation slightly to keep slider drag super responsive
    const timer = setTimeout(() => {
      const img = new Image();
      img.src = processedImage;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = resizeWidth;
        canvas.height = resizeHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const drawMainImage = () => {
          // Apply css-like color adjustments
          ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

          // If cornerRadius active, clip the canvas paths
          if (cornerRadius > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cornerRadius, 0);
            ctx.lineTo(canvas.width - cornerRadius, 0);
            ctx.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
            ctx.lineTo(canvas.width, canvas.height - cornerRadius);
            ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - cornerRadius, canvas.height);
            ctx.lineTo(cornerRadius, canvas.height);
            ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
            ctx.lineTo(0, cornerRadius);
            ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
            ctx.closePath();
            ctx.clip();
          }

          // If cropped, draw slice. Else draw original.
          if (completedCrop) {
            const imgRatioW = img.naturalWidth / img.width;
            const imgRatioH = img.naturalHeight / img.height;
            ctx.drawImage(
              img,
              completedCrop.x * imgRatioW,
              completedCrop.y * imgRatioH,
              completedCrop.width * imgRatioW,
              completedCrop.height * imgRatioH,
              0,
              0,
              canvas.width,
              canvas.height
            );
          } else {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }

          // Restore ctx state if we clipped
          if (cornerRadius > 0) {
            ctx.restore();
          }

          // Apply outline border if active
          if (outlineWidth > 0) {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            if (cornerRadius > 0) {
              ctx.beginPath();
              const r = Math.max(0, cornerRadius - outlineWidth / 2);
              const offset = outlineWidth / 2;
              ctx.moveTo(offset + r, offset);
              ctx.lineTo(canvas.width - offset - r, offset);
              ctx.quadraticCurveTo(canvas.width - offset, offset, canvas.width - offset, offset + r);
              ctx.lineTo(canvas.width - offset, canvas.height - offset - r);
              ctx.quadraticCurveTo(canvas.width - offset, canvas.height - offset, canvas.width - offset - r, canvas.height - offset);
              ctx.lineTo(offset + r, canvas.height - offset);
              ctx.quadraticCurveTo(offset, canvas.height - offset, offset, canvas.height - offset - r);
              ctx.lineTo(offset, offset + r);
              ctx.quadraticCurveTo(offset, offset, offset + r, offset);
              ctx.closePath();
              ctx.stroke();
            } else {
              ctx.strokeRect(outlineWidth / 2, outlineWidth / 2, canvas.width - outlineWidth, canvas.height - outlineWidth);
            }
          }

          // Encode with the same format/quality the user will download, for an accurate estimate
          const dataUrl =
            effectiveFormat === "png"
              ? canvas.toDataURL("image/png")
              : canvas.toDataURL("image/jpeg", jpegQuality / 100);

          // Exact base64 to byte length conversion:
          const commaIndex = dataUrl.indexOf(",") + 1;
          const base64Length = dataUrl.length - commaIndex;
          const sizeInBytes = (base64Length * 3) / 4 - (dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0);

          setEstimatedSizeKB(Math.round(sizeInBytes / 1024));
        };

        // Handle background color, gradient or background image drawing
        if (bgColor === 'image' && backgroundImageSrc) {
          const bgImg = new Image();
          bgImg.src = backgroundImageSrc;
          bgImg.onload = () => {
            ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
            drawMainImage();
          };
          bgImg.onerror = () => {
            drawMainImage();
          };
        } else if (bgColor === 'gradient-blue') {
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, '#3a7bd5');
          grad.addColorStop(1, '#3a6073');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawMainImage();
        } else if (bgColor === 'gradient-gray') {
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, '#bdc3c7');
          grad.addColorStop(1, '#2c3e50');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawMainImage();
        } else if (bgColor === 'gradient-sunset') {
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, '#e65c00');
          grad.addColorStop(1, '#f9d423');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawMainImage();
        } else {
          const fillValue = bgColor === 'custom' ? customColor : bgColor;
          if (fillValue !== 'transparent') {
            ctx.fillStyle = fillValue;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          drawMainImage();
        }
      };
    }, 300);

    return () => clearTimeout(timer);
  }, [
    processedImage, 
    resizeWidth, 
    resizeHeight, 
    bgColor, 
    customColor, 
    backgroundImageSrc,
    brightness, 
    contrast, 
    saturation, 
    completedCrop,
    outlineWidth,
    outlineColor,
    cornerRadius,
    cardShadow,
    effectiveFormat,
    jpegQuality
  ]);

  const updateCropFromDimensions = (w: number, h: number) => {
    if (!imgRef.current) return;
    const image = imgRef.current;
    
    // Scale factor from natural coordinates to display coordinates
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    const displayW = w / scaleX;
    const displayH = h / scaleY;
    
    // Constrain crop box to not exceed screen borders
    const finalW = Math.min(image.width, displayW);
    const finalH = Math.min(image.height, displayH);
    
    // Center it on the viewport
    const newX = (image.width - finalW) / 2;
    const newY = (image.height - finalH) / 2;
    
    const newCrop = {
      unit: "px" as const,
      x: newX,
      y: newY,
      width: finalW,
      height: finalH
    };
    
    setCrop(newCrop);
    setCompletedCrop(newCrop);
  };

  const scaleToPercentage = (pct: number) => {
    setResizePercentage(pct);
    if (!originalWidth) return;
    const targetW = Math.round(originalWidth * (pct / 100));
    const targetH = Math.round(targetW / originalRatio);
    setResizeWidth(targetW);
    setResizeHeight(targetH);
    updateCropFromDimensions(targetW, targetH);
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { width, height } = e.currentTarget;
      const centered = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height), width, height);
      setCrop(centered);
      
      // Initialize completedCrop with display pixel values to activate the Apply Crop button instantly
      const pixelCrop: PixelCrop = {
        unit: 'px',
        x: (centered.x / 100) * width,
        y: (centered.y / 100) * height,
        width: (centered.width / 100) * width,
        height: (centered.height / 100) * height,
      };
      setCompletedCrop(pixelCrop);
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
  };

  const startCropping = () => {
    setIsCropping(true);
    // Force re-initialization of crop selection
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const centered = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect || 1, width, height), width, height);
      setCrop(centered);
      
      const pixelCrop: PixelCrop = {
        unit: 'px',
        x: (centered.x / 100) * width,
        y: (centered.y / 100) * height,
        width: (centered.width / 100) * width,
        height: (centered.height / 100) * height,
      };
      setCompletedCrop(pixelCrop);
    }
  };

  const handleDownload = async () => {
    // If there's an active crop, apply it to the download
    // Otherwise download the current processed image
    if (!processedImage) return;
    
    const imageToDownload = new Image();
    imageToDownload.src = processedImage;
    
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

    canvas.width = resizeWidth || width;
    canvas.height = resizeHeight || height;

    // High-quality resampling so resized/upscaled exports stay crisp
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const drawAndSave = () => {
      // Apply adjustments (brightness, contrast, saturation) to the downloaded canvas
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

      // If cornerRadius active, clip the canvas paths
      if (cornerRadius > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cornerRadius, 0);
        ctx.lineTo(canvas.width - cornerRadius, 0);
        ctx.quadraticCurveTo(canvas.width, 0, canvas.width, cornerRadius);
        ctx.lineTo(canvas.width, canvas.height - cornerRadius);
        ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - cornerRadius, canvas.height);
        ctx.lineTo(cornerRadius, canvas.height);
        ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - cornerRadius);
        ctx.lineTo(0, cornerRadius);
        ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
        ctx.closePath();
        ctx.clip();
      }

      ctx.drawImage(
        imageToDownload,
        startX,
        startY,
        width,
        height,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Restore ctx state if we clipped
      if (cornerRadius > 0) {
        ctx.restore();
      }

      // Apply outline border if active
      if (outlineWidth > 0) {
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = outlineWidth;
        if (cornerRadius > 0) {
          ctx.beginPath();
          const r = Math.max(0, cornerRadius - outlineWidth / 2);
          const offset = outlineWidth / 2;
          ctx.moveTo(offset + r, offset);
          ctx.lineTo(canvas.width - offset - r, offset);
          ctx.quadraticCurveTo(canvas.width - offset, offset, canvas.width - offset, offset + r);
          ctx.lineTo(canvas.width - offset, canvas.height - offset - r);
          ctx.quadraticCurveTo(canvas.width - offset, canvas.height - offset, canvas.width - offset - r, canvas.height - offset);
          ctx.lineTo(offset + r, canvas.height - offset);
          ctx.quadraticCurveTo(offset, canvas.height - offset, offset, canvas.height - offset - r);
          ctx.lineTo(offset, offset + r);
          ctx.quadraticCurveTo(offset, offset, offset + r, offset);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeRect(outlineWidth / 2, outlineWidth / 2, canvas.width - outlineWidth, canvas.height - outlineWidth);
        }
      }

      // PNG = lossless (and the only format that keeps a transparent background);
      // JPEG = smaller file at the user-selected quality.
      const base64Image =
        effectiveFormat === "png"
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", jpegQuality / 100);
      const ext = effectiveFormat === "png" ? "png" : "jpg";

      // Embed physical resolution so the file prints at the intended size. If the crop has a
      // known physical size (e.g. 1.2"), the DPI is derived from the exported pixel width so
      // it maps exactly to those inches; otherwise we default to PRINT_DPI.
      const dpi =
        targetInches && targetInches.w > 0
          ? Math.max(1, Math.round(canvas.width / targetInches.w))
          : PRINT_DPI;
      const blob = dataUrlWithDpi(base64Image, dpi, dpi);
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.download = `studio-photo-${Date.now()}.${ext}`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    // Render background image, gradient or color
    if (bgColor === 'image' && backgroundImageSrc) {
      const bgImg = new Image();
      bgImg.src = backgroundImageSrc;
      bgImg.onload = () => {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        drawAndSave();
      };
      bgImg.onerror = () => {
        drawAndSave();
      };
    } else if (bgColor === 'gradient-blue') {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#3a7bd5');
      grad.addColorStop(1, '#3a6073');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawAndSave();
    } else if (bgColor === 'gradient-gray') {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#bdc3c7');
      grad.addColorStop(1, '#2c3e50');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawAndSave();
    } else if (bgColor === 'gradient-sunset') {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#e65c00');
      grad.addColorStop(1, '#f9d423');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawAndSave();
    } else {
      const fillValue = bgColor === 'custom' ? customColor : bgColor;
      if (fillValue !== 'transparent') {
        ctx.fillStyle = fillValue;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      drawAndSave();
    }
  };


  const handleRemoveBackground = async () => {
    if (!processedImage) return;
    setIsRemovingBg(true);
    setBgProgress(0);

    // Smoothly creep the progress toward ~92% so the reveal always feels alive even when the
    // library can't report fine-grained progress (e.g. during on-device inference). Real download
    // progress events below push it forward faster; completion snaps it to 100%.
    if (bgTimerRef.current) clearInterval(bgTimerRef.current);
    bgTimerRef.current = setInterval(() => {
      setBgProgress((p) => (p < 92 ? p + Math.max(0.4, (92 - p) * 0.05) : p));
    }, 120);

    try {
      // Feed the model roughly its native working resolution (~1024px). Going lower (the old 800px)
      // throws away edge detail and leaves stray background behind; going much higher just costs time
      // because the ISNet network resizes internally anyway.
      const resizedBase64 = await resizeImageForWasm(processedImage, 1024);

      // Run the higher-accuracy fp16 model, exporting a lossless PNG cutout (subject + transparent
      // background). Prefer WebGPU when the browser exposes it, but some browsers report support and
      // still fail to initialise the GPU backend, so fall back to CPU rather than erroring out.
      const runRemoval = (device: "gpu" | "cpu") =>
        removeBackground(resizedBase64, {
          model: selectedModel, // Chosen in the (password-gated) model picker; defaults to balanced fp16
          device,
          output: { format: "image/png", quality: 1 },
          progress: (key: string, current: number, total: number) => {
            if (total > 0) {
              const pct = (current / total) * 100;
              // Never move backward, and leave headroom (cap 90%) for the final compositing step.
              setBgProgress((p) => Math.max(p, Math.min(90, pct)));
            }
          },
        });

      const supportsGpu = typeof navigator !== "undefined" && "gpu" in navigator;

      let cutoutBlob: Blob;
      try {
        cutoutBlob = await runRemoval(supportsGpu ? "gpu" : "cpu");
      } catch (gpuErr) {
        console.warn("GPU background removal failed; retrying on CPU.", gpuErr);
        cutoutBlob = await runRemoval("cpu");
      }

      // Load original high-res image
      const originalImg = new Image();
      originalImg.src = processedImage;
      await new Promise((resolve) => {
        originalImg.onload = resolve;
      });

      // Load the (low-res) transparent cutout returned by the model; its alpha channel is the mask
      const maskUrl = URL.createObjectURL(cutoutBlob);
      const maskImg = new Image();
      maskImg.src = maskUrl;
      await new Promise((resolve) => {
        maskImg.onload = resolve;
      });

      const fullW = originalImg.naturalWidth;
      const fullH = originalImg.naturalHeight;

      // Create a canvas at original high-res dimensions
      const highResCanvas = document.createElement("canvas");
      highResCanvas.width = fullW;
      highResCanvas.height = fullH;
      const hrCtx = highResCanvas.getContext("2d");

      if (hrCtx) {
        hrCtx.imageSmoothingEnabled = true;
        hrCtx.imageSmoothingQuality = "high";

        // Draw the high-res original image first
        hrCtx.drawImage(originalImg, 0, 0, fullW, fullH);

        // Smoothly upscale the mask to full resolution on its own canvas so we can refine it
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = fullW;
        maskCanvas.height = fullH;
        const maskCtx = maskCanvas.getContext("2d");

        if (maskCtx) {
          maskCtx.imageSmoothingEnabled = true;
          maskCtx.imageSmoothingQuality = "high";
          maskCtx.drawImage(maskImg, 0, 0, fullW, fullH);

          // The cutout's alpha channel is our mask. We (1) smoothstep it so faint background
          // ghosting goes fully transparent, then (2) erode (shrink) the mask by a couple of pixels
          // to cut away the contaminated edge ring that still carries the old background colour
          // (e.g. a blue halo from a blue backdrop). RGB is forced to white so the later
          // destination-in keeps the original subject colours untouched.
          try {
            const maskData = maskCtx.getImageData(0, 0, fullW, fullH);
            const d = maskData.data;
            const total = fullW * fullH;
            const low = 50;   // alpha below this => background (fully cut out)
            const high = 205; // alpha above this => solid subject

            // 1. Smoothstep the raw alpha into a working buffer.
            const src = new Uint8ClampedArray(total);
            for (let p = 0, i = 3; p < total; p++, i += 4) {
              const a = d[i];
              if (a <= low) {
                src[p] = 0;
              } else if (a >= high) {
                src[p] = 255;
              } else {
                const t = (a - low) / (high - low);
                src[p] = Math.round(t * t * (3 - 2 * t) * 255);
              }
            }

            // 2. Erode by a radius proportional to how much we upscaled the mask, so the colour
            // fringe (which is roughly one model-pixel wide) is removed at any resolution.
            const scale = fullW / Math.max(1, maskImg.naturalWidth || fullW);
            const radius = Math.min(5, Math.max(1, Math.round(scale * 1.5)));

            // Separable min-filter: horizontal pass into `tmp`, vertical pass back into alpha.
            const tmp = new Uint8ClampedArray(total);
            for (let y = 0; y < fullH; y++) {
              const row = y * fullW;
              for (let x = 0; x < fullW; x++) {
                let m = 255;
                const x0 = Math.max(0, x - radius);
                const x1 = Math.min(fullW - 1, x + radius);
                for (let xx = x0; xx <= x1; xx++) {
                  const v = src[row + xx];
                  if (v < m) m = v;
                }
                tmp[row + x] = m;
              }
            }
            for (let x = 0; x < fullW; x++) {
              for (let y = 0; y < fullH; y++) {
                let m = 255;
                const y0 = Math.max(0, y - radius);
                const y1 = Math.min(fullH - 1, y + radius);
                for (let yy = y0; yy <= y1; yy++) {
                  const v = tmp[yy * fullW + x];
                  if (v < m) m = v;
                }
                const i = (y * fullW + x) * 4;
                d[i] = 255;
                d[i + 1] = 255;
                d[i + 2] = 255;
                d[i + 3] = m;
              }
            }
            maskCtx.putImageData(maskData, 0, 0);
          } catch (refineErr) {
            // getImageData can throw on a tainted canvas; fall back to the raw upscaled mask.
            console.warn("Alpha refinement skipped:", refineErr);
          }

          // Clip the high-res pixels with the refined full-res mask
          hrCtx.globalCompositeOperation = "destination-in";
          hrCtx.drawImage(maskCanvas, 0, 0);
          hrCtx.globalCompositeOperation = "source-over";
        }

        // Output the high-res cutout (PNG keeps the transparency)
        const highResBase64 = highResCanvas.toDataURL("image/png");
        setProcessedImage(highResBase64);
        // A cutout is only meaningful on a transparent canvas, so default the background to none.
        setBgColor("transparent");
      } else {
        // Fallback if canvas context fails
        setProcessedImage(maskUrl);
      }

      // Cleanup mask blob URL
      URL.revokeObjectURL(maskUrl);

      // Snap to 100% and let the reveal finish wiping the blur away before we hide the overlay.
      if (bgTimerRef.current) {
        clearInterval(bgTimerRef.current);
        bgTimerRef.current = null;
      }
      setBgProgress(100);
      await new Promise((r) => setTimeout(r, 450));
    } catch (error) {
      console.error("Local background removal failed:", error);
      const detail = error instanceof Error ? error.message : String(error);
      alert(
        `Background removal failed.\n\n${detail}\n\nTip: the model file (tens of MB) downloads on first use \u2014 check your connection, or try the "Fast" model from Change.`
      );
    } finally {
      if (bgTimerRef.current) {
        clearInterval(bgTimerRef.current);
        bgTimerRef.current = null;
      }
      setIsRemovingBg(false);
    }
  };

  const getBackgroundStyle = () => {
    if (bgColor === 'custom') return { backgroundColor: customColor };
    if (bgColor === 'transparent') return { backgroundColor: 'transparent' };
    if (bgColor === 'image' && backgroundImageSrc) {
      return {
        backgroundImage: `url(${backgroundImageSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (bgColor === 'gradient-blue') return { background: 'linear-gradient(180deg, #3a7bd5 0%, #3a6073 100%)' };
    if (bgColor === 'gradient-gray') return { background: 'linear-gradient(180deg, #bdc3c7 0%, #2c3e50 100%)' };
    if (bgColor === 'gradient-sunset') return { background: 'linear-gradient(180deg, #e65c00 0%, #f9d423 100%)' };
    return { backgroundColor: bgColor };
  };

  return (
    <div className="flex flex-col xl:flex-row gap-8 items-start max-w-[1550px] mx-auto p-4">
      <div className="flex-1 glass rounded-xl p-6 overflow-hidden w-full min-w-[320px]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onReset}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Back to upload"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h2 className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Camera className="w-5 h-5" />
              </span>
              <span className="text-base font-semibold tracking-tight text-slate-900">
                Editor
              </span>
            </h2>
          </div>
          <button
            onClick={() => {
              setProcessedImage(imageSrc);
              setIsCropping(false);
              setCrop(undefined);
              setCompletedCrop(undefined);
              setOutlineWidth(0);
              setOutlineColor('#000000');
              setCornerRadius(0);
              setCardShadow('none');
            }}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1.5"
          >
            <RefreshCcw className="w-4 h-4" /> Reset all
          </button>
        </div>

        <div className="relative checkerboard rounded-xl overflow-hidden flex justify-center items-center min-h-[400px] border border-slate-200">
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
                src={processedImage || undefined}
                alt="To Crop"
                onLoad={onImageLoad}
                className="max-w-full h-auto transition-colors duration-300"
                style={{ 
                  ...getBackgroundStyle(),
                  filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                  border: outlineWidth > 0 ? `${outlineWidth}px solid ${outlineColor}` : 'none',
                  borderRadius: `${cornerRadius}px`,
                  boxShadow: cardShadow === 'soft' ? '0 4px 20px rgba(0,0,0,0.08)' : cardShadow === 'medium' ? '0 10px 30px rgba(0,0,0,0.15)' : cardShadow === 'hard' ? '0 20px 50px rgba(0,0,0,0.3)' : 'none',
                  boxSizing: 'border-box'
                }}
              />
            </ReactCrop>
          ) : (
            <img
              ref={imgRef}
              src={processedImage || undefined}
              alt="Processed"
              className="max-w-full h-auto max-h-[600px] transition-all duration-300 relative z-10"
              style={{ 
                ...getBackgroundStyle(),
                filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                border: outlineWidth > 0 ? `${outlineWidth}px solid ${outlineColor}` : 'none',
                borderRadius: `${cornerRadius}px`,
                boxShadow: cardShadow === 'soft' ? '0 4px 20px rgba(0,0,0,0.08)' : cardShadow === 'medium' ? '0 10px 30px rgba(0,0,0,0.15)' : cardShadow === 'hard' ? '0 20px 50px rgba(0,0,0,0.3)' : 'none',
                boxSizing: 'border-box'
              }}
            />
          )}

          {/* Background-removal progress: a frosted layer that wipes away top-to-bottom. */}
          {isRemovingBg && (
            <div className="absolute inset-0 z-30 overflow-hidden pointer-events-none select-none">
              {/* Frosted layer covering the not-yet-processed (lower) portion; recedes downward. */}
              <div
                className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/40 transition-[height] duration-150 ease-linear"
                style={{ height: `${100 - bgProgress}%` }}
              />
              {/* Glowing scan line at the reveal boundary. */}
              <div
                className="absolute inset-x-0 transition-[top] duration-150 ease-linear"
                style={{ top: `${bgProgress}%` }}
              >
                <div className="h-0.5 w-full bg-indigo-500/90 shadow-[0_0_14px_3px_rgba(99,102,241,0.65)]" />
              </div>
              {/* Status chip with the live percentage. */}
              <div className="absolute inset-x-0 bottom-5 flex justify-center">
                <div className="flex items-center gap-2.5 rounded-full bg-slate-900/85 px-4 py-2 text-white shadow-lg backdrop-blur-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-semibold tabular-nums">{Math.round(bgProgress)}%</span>
                  <span className="text-xs text-white/70">Removing background</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons directly below the image canvas */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={handleDownload}
            className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            Download {effectiveFormat === 'png' ? 'PNG' : 'JPG'}
          </button>

          <button
            onClick={onReset}
            className="px-5 py-3 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            New photo
          </button>
        </div>
      </div>

      {/* Sidebar Wrapper: Multi-Column layout on large viewports */}
      <div className="w-full xl:w-auto flex flex-col md:flex-row gap-6 shrink-0">
        {/* Column 2: Crop, AI, and Background */}
        <div className="w-full md:w-80 flex flex-col gap-6">
          {/* Crop Controls */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">1. Crop & Resize</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setAspect(p.aspect);
                  // Track the physical print size (if this preset has one) for DPI embedding.
                  setTargetInches(
                    typeof p.width === "number" && typeof p.height === "number"
                      ? { w: p.width, h: p.height }
                      : null
                  );
                  setIsCropping(true);
                  if (imgRef.current) {
                    const { width, height } = imgRef.current;
                    const newCrop = centerCrop(
                      makeAspectCrop(
                        { unit: "%", width: 90 },
                        p.aspect || 1.0, // Fallback to square if free aspect
                        width,
                        height
                      ),
                      width,
                      height
                    );
                    setCrop(newCrop);
                    
                    // Convert percentage coordinates to precise pixel crop
                    const pixelCrop: PixelCrop = {
                      unit: "px",
                      x: (newCrop.x / 100) * width,
                      y: (newCrop.y / 100) * height,
                      width: (newCrop.width / 100) * width,
                      height: (newCrop.height / 100) * height
                    };
                    setCompletedCrop(pixelCrop);
                  }
                }}
                className={`p-3 rounded-xl border transition-all text-sm font-medium ${
                  aspect === p.aspect
                    ? "bg-indigo-50 border-indigo-600 text-indigo-600 font-bold"
                    : "bg-slate-50 border-slate-300 text-slate-600 hover:border-slate-400"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Crop Dimensions Section */}
          <div className="border-t border-slate-100 pt-4 mt-4 mb-4">
            <button
              type="button"
              onClick={() => setIsCustomCropOpen(!isCustomCropOpen)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 text-left focus:outline-none"
            >
              <span>Custom Dimensions</span>
              <ChevronDown 
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  isCustomCropOpen ? "rotate-180" : ""
                }`} 
              />
            </button>
            
            {isCustomCropOpen && (
              <div className="mt-3">
                {/* Unit Selector */}
                <div className="grid grid-cols-3 gap-1.5 mb-3 bg-slate-100 p-1 rounded-xl">
                  {(['in', 'cm', 'px'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => {
                        setCustomCropUnit(unit);
                        // Update default values to make it easy for user
                        if (unit === 'in') {
                          setCustomCropWidth('1.5');
                          setCustomCropHeight('2.0');
                        } else if (unit === 'cm') {
                          setCustomCropWidth('3.5');
                          setCustomCropHeight('4.5');
                        } else {
                          setCustomCropWidth('450');
                          setCustomCropHeight('600');
                        }
                      }}
                      className={`py-1 rounded-lg text-xs font-bold transition-all ${
                        customCropUnit === unit 
                          ? "bg-white text-slate-800 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {unit.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Dimensions Input Fields */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Width</label>
                    <input
                      type="number"
                      step={customCropUnit === 'px' ? '1' : '0.1'}
                      value={customCropWidth}
                      onChange={(e) => setCustomCropWidth(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 transition-all"
                      min="0.1"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Height</label>
                    <input
                      type="number"
                      step={customCropUnit === 'px' ? '1' : '0.1'}
                      value={customCropHeight}
                      onChange={(e) => setCustomCropHeight(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600 transition-all"
                      min="0.1"
                    />
                  </div>
                </div>

                {/* Set Dimensions Button */}
                <button
                  type="button"
                  onClick={() => {
                    const wVal = parseFloat(customCropWidth) || 0;
                    const hVal = parseFloat(customCropHeight) || 0;
                    if (wVal <= 0 || hVal <= 0) return;

                    let pxW = wVal;
                    let pxH = hVal;

                    if (customCropUnit === 'in') {
                      pxW = wVal * 300;
                      pxH = hVal * 300;
                    } else if (customCropUnit === 'cm') {
                      pxW = wVal * 118.11;
                      pxH = hVal * 118.11;
                    }

                    const calculatedAspect = pxW / pxH;
                    setAspect(calculatedAspect);

                    // Remember the physical size for DPI embedding. Pixel crops have no
                    // fixed physical size, so they fall back to the default print DPI.
                    if (customCropUnit === "in") {
                      setTargetInches({ w: wVal, h: hVal });
                    } else if (customCropUnit === "cm") {
                      setTargetInches({ w: wVal / 2.54, h: hVal / 2.54 });
                    } else {
                      setTargetInches(null);
                    }

                    if (!isCropping) startCropping();
                    
                    // Allow state update to populate ReactCrop first, then resize selectors
                    setTimeout(() => {
                      updateCropFromDimensions(pxW, pxH);
                    }, 100);
                  }}
                  className="w-full py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 active:scale-[0.98] text-xs font-bold text-indigo-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5" />
                  Set Custom Crop Box
                </button>
              </div>
            )}
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
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
            >
              <Scissors className="w-4 h-4" />
              Crop
            </button>
          )}
        </div>

        {/* AI Tools */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">2. Background Removal</h3>
          <button
            onClick={handleRemoveBackground}
            disabled={isRemovingBg}
            className="w-full py-3 rounded-lg bg-indigo-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50"
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

          {/* Model selector (password protected) */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Model</span>
                <span className="text-sm font-bold text-slate-700">
                  {MODELS.find((m) => m.id === selectedModel)?.label}
                  <span className="text-xs font-medium text-slate-400 ml-1">
                    ({MODELS.find((m) => m.id === selectedModel)?.size})
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModelPanelOpen((v) => !v);
                  setModelError("");
                  setModelPasswordInput("");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all"
              >
                {isModelUnlocked ? <Sliders className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                Change
              </button>
            </div>

            {isModelPanelOpen && (
              <div className="mt-3">
                {!isModelUnlocked ? (
                  <form
                    onSubmit={handleUnlockSubmit}
                    className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200"
                  >
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> Enter password to change model
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={modelPasswordInput}
                        onChange={(e) => {
                          setModelPasswordInput(e.target.value);
                          setModelError("");
                        }}
                        placeholder="Password"
                        autoFocus
                        className={`flex-1 min-w-0 px-3 py-2 rounded-xl bg-white border text-xs font-bold text-slate-800 focus:outline-none transition-all ${
                          modelError ? "border-red-400 focus:border-red-500" : "border-slate-200 focus:border-indigo-600"
                        }`}
                      />
                      <button
                        type="submit"
                        disabled={isUnlocking || !modelPasswordInput}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center gap-1.5"
                      >
                        {isUnlocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Unlock
                      </button>
                    </div>
                    {modelError && (
                      <p className="text-[11px] font-semibold text-red-500">{modelError}</p>
                    )}
                  </form>
                ) : (
                  <div className="flex flex-col gap-2">
                    {MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedModel(m.id)}
                        className={`text-left p-3 rounded-2xl border transition-all ${
                          selectedModel === m.id
                            ? "bg-indigo-50 border-indigo-600"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-bold ${selectedModel === m.id ? "text-indigo-700" : "text-slate-700"}`}>
                            {m.label}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{m.size}</span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-500 mt-0.5 leading-snug">{m.desc}</p>
                      </button>
                    ))}
                    <p className="text-[10px] font-medium text-slate-400 leading-snug mt-0.5">
                      Bigger models download once (then cached) and run slower, but leave less background behind.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Background Color */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">3. Background</h3>
          
          <div className="grid grid-cols-5 gap-2 mb-4">
            {BG_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setBgColor(c.value)}
                title={c.name}
                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center overflow-hidden ${
                  bgColor === c.value || (c.value === 'custom' && bgColor === 'custom')
                    ? "border-primary scale-110 shadow-md"
                    : "border-slate-200 hover:scale-[1.05]"
                }`}
                style={{ 
                  backgroundColor: c.value === 'transparent' ? 'transparent' : (c.value === 'custom' ? customColor : c.value) 
                }}
              >
                {c.value === 'transparent' && (
                  <div className="w-full h-full checkerboard opacity-60" />
                )}
                {c.value === 'custom' && (
                  <div className="w-full h-full bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 opacity-40 mix-blend-overlay" />
                )}
              </button>
            ))}
          </div>

          {/* Premium Color Picker - Always Visible */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Custom Color Wheel</label>
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-all duration-200">
              <div 
                className="w-10 h-10 rounded-xl border border-slate-300 relative overflow-hidden flex-shrink-0 cursor-pointer shadow-sm"
                style={{ backgroundColor: customColor }}
                onClick={() => {
                  setBgColor('custom');
                  document.getElementById('hidden-color-picker')?.click();
                }}
              >
                {/* Visual spectrum indicator inside the color swatch box */}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 rounded-tl-md border-t border-l border-white/50" />
                <input
                  id="hidden-color-picker"
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setBgColor('custom');
                    setCustomColor(e.target.value);
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">
                  {bgColor === 'custom' ? 'Custom Color Active' : 'Select Custom...'}
                </p>
                <p className="text-xs font-mono text-slate-400">
                  {customColor.toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => {
                  setBgColor('custom');
                  document.getElementById('hidden-color-picker')?.click();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Pick Color
              </button>
            </div>
          </div>

          {/* Custom Studio Backdrop Section */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Studio Backdrops & Uploads</label>
            
            {/* Backdrop Preset Gradients */}
            <div className="flex gap-2">
              {[
                { id: 'gradient-blue', name: 'Studio Blue', style: 'linear-gradient(180deg, #3a7bd5 0%, #3a6073 100%)' },
                { id: 'gradient-gray', name: 'Slate Portrait', style: 'linear-gradient(180deg, #bdc3c7 0%, #2c3e50 100%)' },
                { id: 'gradient-sunset', name: 'Sunset Glow', style: 'linear-gradient(180deg, #e65c00 0%, #f9d423 100%)' },
              ].map((grad) => (
                <button
                  key={grad.id}
                  onClick={() => setBgColor(grad.id)}
                  title={grad.name}
                  className={`flex-1 h-9 rounded-xl border-2 transition-all hover:scale-[1.03] active:scale-[0.97] ${
                    bgColor === grad.id ? 'border-primary shadow-sm scale-[1.03]' : 'border-slate-200'
                  }`}
                  style={{ background: grad.style }}
                />
              ))}
            </div>

            {/* Custom Background Upload Swatch */}
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-all duration-200">
              <div 
                className={`w-10 h-10 rounded-xl border border-slate-300 relative overflow-hidden flex-shrink-0 cursor-pointer shadow-sm flex items-center justify-center bg-slate-200 ${
                  bgColor === 'image' && backgroundImageSrc ? 'border-primary scale-[1.03]' : ''
                }`}
                style={{ 
                  backgroundImage: backgroundImageSrc ? `url(${backgroundImageSrc})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
                onClick={() => {
                  document.getElementById('hidden-bg-uploader')?.click();
                }}
              >
                {!backgroundImageSrc && <ImagePlus className="w-5 h-5 text-slate-400" />}
                <input
                  id="hidden-bg-uploader"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const src = event.target?.result as string;
                        setBackgroundImageSrc(src);
                        setBgColor('image');
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">
                  {backgroundImageSrc ? 'Custom Backdrop Active' : 'Custom Backdrop Photo'}
                </p>
                <p className="text-xs font-medium text-slate-400 truncate">
                  {backgroundImageSrc ? 'Click to Change Backdrop' : 'Upload custom studio background'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  document.getElementById('hidden-bg-uploader')?.click();
                }}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {backgroundImageSrc ? 'Replace' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Column 3: Adjustments and Resizer */}
      <div className="w-full md:w-80 flex flex-col gap-6">
        {/* Image Adjustments */}
        <div className="glass rounded-xl p-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">4. Image Adjustments</h3>

          {/* Slider Sliders */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Brightness</span>
                <span>{brightness}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="150"
                value={brightness}
                onChange={(e) => setBrightness(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Contrast</span>
                <span>{contrast}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="150"
                value={contrast}
                onChange={(e) => setContrast(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Saturation</span>
                <span>{saturation}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={saturation}
                onChange={(e) => setSaturation(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Outline & Border Option */}
            <div className="border-t border-slate-100 pt-4 mt-2 flex flex-col gap-3">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-400">
                  Image Border / Outline
                </span>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Border Width</span>
                  <span>{outlineWidth}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  value={outlineWidth}
                  onChange={(e) => setOutlineWidth(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {outlineWidth > 0 && (
                <div className="flex flex-col gap-1.5 animate-fadeIn">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>Border Color</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={outlineColor}
                      onChange={(e) => setOutlineColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 overflow-hidden bg-transparent shrink-0"
                    />
                    <div className="flex gap-1.5 flex-1">
                      {['#000000', '#ffffff', '#3b82f6', '#ef4444', '#10b981'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setOutlineColor(c)}
                          className={`w-6 h-6 rounded-full border border-slate-200 shadow-sm transition-all hover:scale-110`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Corner Roundness & Soft Shadow Options */}
            <div className="border-t border-slate-100 pt-4 mt-2 flex flex-col gap-3">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-400">
                Card Shapes & Shadows
              </span>

              {/* Corner Roundness Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Corner Roundness</span>
                  <span>{cornerRadius}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="48"
                  value={cornerRadius}
                  onChange={(e) => setCornerRadius(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Card Shadow Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-600">Drop Shadow</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'none', label: 'None' },
                    { id: 'soft', label: 'Soft' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'hard', label: 'Hard' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCardShadow(s.id)}
                      className={`py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        cardShadow === s.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {(brightness !== 100 || contrast !== 100 || saturation !== 100 || outlineWidth !== 0 || cornerRadius !== 0 || cardShadow !== 'none') && (
              <button
                type="button"
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                  setOutlineWidth(0);
                  setOutlineColor('#000000');
                  setCornerRadius(0);
                  setCardShadow('none');
                }}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-500 transition-all text-left"
              >
                Reset Adjustments & Borders
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Image Resizer */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-5 h-5 text-indigo-600" />
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">5. Resize &amp; Export</h3>
          </div>

          <div className="flex flex-col gap-4">
            {/* Input Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Width (px)</label>
                <input
                  type="number"
                  value={resizeWidth || ""}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 0);
                    setResizeWidth(val);
                    if (maintainAspectRatio && originalRatio) {
                      const targetH = Math.round(val / originalRatio);
                      setResizeHeight(targetH);
                    }
                    if (originalWidth) {
                      setResizePercentage(Math.round((val / originalWidth) * 100));
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary transition-all"
                  min="1"
                />
              </div>
 
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500">Height (px)</label>
                <input
                  type="number"
                  value={resizeHeight || ""}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 0);
                    setResizeHeight(val);
                    if (maintainAspectRatio && originalRatio) {
                      const targetW = Math.round(val * originalRatio);
                      setResizeWidth(targetW);
                    }
                    if (originalWidth) {
                      setResizePercentage(Math.round(((val * (originalRatio || 1)) / originalWidth) * 100));
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary transition-all"
                  min="1"
                />
              </div>
            </div>
 
            {/* Custom Percentage Input & Slider */}
            <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                <span>Scale Percentage</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={resizePercentage}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 0);
                      setResizePercentage(val);
                      if (originalWidth) {
                        const targetW = Math.round(originalWidth * (val / 100));
                        const targetH = Math.round(targetW / originalRatio);
                        setResizeWidth(targetW);
                        setResizeHeight(targetH);
                      }
                    }}
                    className="w-12 px-1 py-0.5 rounded border border-slate-200 text-center font-bold text-slate-850 focus:outline-none text-xs"
                    min="1"
                  />
                  <span>%</span>
                </div>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                value={resizePercentage}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setResizePercentage(val);
                  if (originalWidth) {
                    const targetW = Math.round(originalWidth * (val / 100));
                    const targetH = Math.round(targetW / originalRatio);
                    setResizeWidth(targetW);
                    setResizeHeight(targetH);
                  }
                }}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Maintain Aspect Ratio Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={maintainAspectRatio}
                onChange={(e) => {
                  setMaintainAspectRatio(e.target.checked);
                  if (e.target.checked && resizeWidth) {
                    setResizeHeight(Math.round(resizeWidth / originalRatio));
                  }
                }}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary accent-primary"
              />
              <span className="text-xs font-semibold text-slate-600">Lock Aspect Ratio</span>
            </label>

            {/* Percentage Scale Buttons */}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-2">Preset Scales</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "50%", value: 50 },
                  { label: "75%", value: 75 },
                  { label: "100%", value: 100 },
                  { label: "125%", value: 125 },
                  { label: "150%", value: 150 },
                  { label: "200%", value: 200 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => scaleToPercentage(preset.value)}
                    className="py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Export Format & Quality */}
            <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-500 block">Download Format</label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                {([
                  { id: 'jpeg', label: 'JPG' },
                  { id: 'png', label: 'PNG' },
                ] as const).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setExportFormat(fmt.id)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                      effectiveFormat === fmt.id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {fmt.label}
                    {fmt.id === 'png' && (
                      <span className="block text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                        Lossless · Transparent
                      </span>
                    )}
                    {fmt.id === 'jpeg' && (
                      <span className="block text-[9px] font-medium text-slate-400 leading-none mt-0.5">
                        Smaller file
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {bgColor === 'transparent' && (
                <p className="text-[10px] font-medium text-indigo-500">
                  Transparent background detected — exporting as PNG to keep it.
                </p>
              )}

              {effectiveFormat === 'jpeg' && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>JPG Quality</span>
                    <span>{jpegQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="100"
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              )}
            </div>

            {/* Estimated Size and Status */}
            <div className="mt-2 p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">Est. File Size:</span>
              <span className="font-bold text-indigo-700 bg-indigo-100/60 px-2.5 py-1 rounded-lg">
                ~{estimatedSizeKB >= 1024 
                  ? `${(estimatedSizeKB / 1024).toFixed(1)} MB` 
                  : `${estimatedSizeKB} KB`
                }
              </span>
            </div>

            {/* Physical print size — embedded as DPI metadata in the download so it prints
                at the right size in CorelDRAW / Photoshop / Word etc. */}
            {(() => {
              if (!resizeWidth || !resizeHeight) return null;
              const dpi =
                targetInches && targetInches.w > 0
                  ? Math.max(1, Math.round(resizeWidth / targetInches.w))
                  : PRINT_DPI;
              const printW = resizeWidth / dpi;
              const printH = resizeHeight / dpi;
              return (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-500">Print Size:</span>
                  <span className="font-bold text-slate-700">
                    {printW.toFixed(2)}&Prime; × {printH.toFixed(2)}&Prime;
                    <span className="ml-1.5 font-medium text-slate-400">@ {dpi} DPI</span>
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
