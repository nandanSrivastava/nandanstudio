"use client";

import React from "react";
import { FileText, Download, Eye, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";

interface DocumentPreviewProps {
  file: File;
  onReset: () => void;
}

export default function DocumentPreview({ file, onReset }: DocumentPreviewProps) {
  const fileSize = (file.size / (1024 * 1024)).toFixed(2);

  const handleDownload = () => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto w-full p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-8 flex flex-col items-center text-center"
      >
        <div className="w-24 h-24 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
          <FileText className="w-12 h-12 text-primary" />
        </div>
        
        <h2 className="text-2xl font-bold text-white/90 mb-2 truncate max-w-full">
          {file.name}
        </h2>
        <p className="text-white/40 mb-8">
          {file.type} • {fileSize} MB
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-all"
          >
            <Download className="w-5 h-5" />
            Download
          </button>
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
          >
            <RefreshCcw className="w-5 h-5" />
            Upload New
          </button>
        </div>

        <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/10 text-sm text-white/60 w-full">
          <p>
            Document processing for non-image files currently supports storage and metadata extraction.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
