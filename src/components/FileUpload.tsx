"use client";

import React, { useState } from "react";
import { Upload, File, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept: string;
  label: string;
  icon?: React.ReactNode;
}

export default function FileUpload({ onFileSelect, accept, label, icon }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (accept === "*" || file.type.match(accept.replace("*", ".*")))) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
    onFileSelect(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const clearFile = () => {
    setPreview(null);
    setFileName(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <AnimatePresence mode="wait">
        {!fileName ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative group cursor-pointer rounded-xl border border-dashed bg-white transition-colors min-h-[220px] flex flex-col items-center justify-center p-8 ${
              isDragging
                ? "border-indigo-500 bg-indigo-50/50"
                : "border-slate-300 hover:border-slate-400"
            }`}
          >
            <input
              type="file"
              accept={accept}
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600 mb-4">
              {icon || <Upload className="w-6 h-6" />}
            </div>
            <h3 className="text-base font-semibold text-slate-900">{label}</h3>
            <p className="mt-1 text-sm text-slate-500">Drag and drop, or click to browse</p>
            <p className="mt-3 text-xs text-slate-400">JPG, PNG, WebP &middot; processed locally</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass rounded-xl p-4 relative flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
              {preview ? (
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <File className="w-6 h-6 text-slate-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{fileName}</p>
              <p className="text-sm text-slate-500">Ready to edit</p>
            </div>
            <button
              onClick={clearFile}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Remove file"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
