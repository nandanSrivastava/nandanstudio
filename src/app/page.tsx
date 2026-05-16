"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Image as ImageIcon, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import FileUpload from "@/components/FileUpload";
import PhotoEditor from "@/components/PhotoEditor";
import DocumentPreview from "@/components/DocumentPreview";

export default function Home() {
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<"landing" | "photo" | "document">("landing");
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeFile) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeFile]);

  const handleFileSelect = (file: File, mode: "photo" | "document") => {
    setActiveFile(file);
    setViewMode(mode);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setImageSrc(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const reset = () => {
    setActiveFile(null);
    setImageSrc(null);
    // Note: We keep the viewMode as 'photo' or 'document' so the user stays in that section
  };

  const fullReset = () => {
    setActiveFile(null);
    setViewMode("landing");
    setImageSrc(null);
  };

  return (
    <main className="min-h-screen pt-8 pb-32 px-4">
      {/* Navbar */}
      <nav className="max-w-6xl mx-auto flex items-center justify-between mb-12">
        <div className="flex items-center gap-2 group cursor-default">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-brand-secondary flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
            <Sparkles className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">
            Nandan <span className="text-primary">Digital Studio</span>
          </span>
        </div>
      </nav>
      
      <AnimatePresence>
        {viewMode === "landing" && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              The Ultimate Studio for Professionals
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight text-slate-900">
              Transform Your <span className="text-gradient">Photos & Docs</span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
              Pro-grade cropping, AI background removal, and document processing. 
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workspace */}
      <section className="container mx-auto">
        <AnimatePresence mode="wait">
          {viewMode === "landing" ? (
            <motion.div
              key="landing-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto"
            >
              <div className="flex flex-col">
                <div className="mb-4 flex items-center gap-3 text-slate-800 font-semibold">
                  <div className="p-2 rounded-lg bg-indigo-100">
                    <ImageIcon className="w-5 h-5 text-indigo-600" />
                  </div>
                  Photo Studio
                </div>
                <FileUpload
                  onFileSelect={(f) => handleFileSelect(f, "photo")}
                  accept="image/*"
                  label="Upload Photos"
                />
              </div>

              <div className="flex flex-col">
                <div className="mb-4 flex items-center gap-3 text-slate-800 font-semibold">
                  <div className="p-2 rounded-lg bg-pink-100">
                    <FileText className="w-5 h-5 text-pink-600" />
                  </div>
                  Document Hub
                </div>
                <FileUpload
                  onFileSelect={(f) => handleFileSelect(f, "document")}
                  accept=".pdf,.doc,.docx,.txt"
                  label="Upload Documents"
                  icon={<FileText className="w-8 h-8 text-pink-600/50" />}
                />
              </div>
            </motion.div>
          ) : viewMode === "photo" ? (
            <motion.div
              key="photo-studio-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {activeFile && imageSrc ? (
                <PhotoEditor imageSrc={imageSrc} onReset={reset} />
              ) : (
                <div className="max-w-xl mx-auto text-center">
                  <button 
                    onClick={fullReset}
                    className="mb-8 text-slate-400 hover:text-slate-600 flex items-center gap-2 mx-auto transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                  </button>
                  <h2 className="text-3xl font-bold mb-8 flex items-center justify-center gap-3 text-slate-800">
                    <ImageIcon className="w-8 h-8 text-indigo-600" />
                    Photo Studio
                  </h2>
                  <FileUpload
                    onFileSelect={(f) => handleFileSelect(f, "photo")}
                    accept="image/*"
                    label="Select New Photo"
                  />
                </div>
              )}
            </motion.div>
          ) : viewMode === "document" ? (
            <motion.div
              key="document-hub-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {activeFile ? (
                <DocumentPreview file={activeFile} onReset={reset} />
              ) : (
                <div className="max-w-xl mx-auto text-center">
                  <button 
                    onClick={fullReset}
                    className="mb-8 text-slate-400 hover:text-slate-600 flex items-center gap-2 mx-auto transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                  </button>
                  <h2 className="text-3xl font-bold mb-8 flex items-center justify-center gap-3 text-slate-800">
                    <FileText className="w-8 h-8 text-pink-600" />
                    Document Hub
                  </h2>
                  <FileUpload
                    onFileSelect={(f) => handleFileSelect(f, "document")}
                    accept=".pdf,.doc,.docx,.txt"
                    label="Select New Document"
                    icon={<FileText className="w-8 h-8 text-pink-600/50" />}
                  />
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      {/* Features Grid */}
      {viewMode === "landing" && (
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="max-w-6xl mx-auto mt-32 grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {[
            {
              title: "Precise Cropping",
              desc: "1.20\"x1.50\", 4\"x6\", and other industry standards at your fingertips.",
              color: "bg-blue-100 text-blue-600"
            },
            {
              title: "AI Background Removal",
              desc: "Magic eraser technology to clean up your shots instantly.",
              color: "bg-purple-100 text-purple-600"
            },
            {
              title: "High-Quality Exports",
              desc: "Download your processed files in crisp .jpg format ready for print.",
              color: "bg-pink-100 text-pink-600"
            }
          ].map((feat, i) => (
            <div key={i} className="glass p-8 rounded-3xl group hover:border-primary/40 transition-all">
              <div className={`w-12 h-12 rounded-2xl ${feat.color} flex items-center justify-center mb-6 font-bold`}>
                {i + 1}
              </div>
              <h3 className="text-xl font-bold mb-4 text-slate-800">{feat.title}</h3>
              <p className="text-slate-500 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </motion.section>
      )}
      {/* Footer */}
      <footer className="container mx-auto mt-32 pt-12 border-t border-slate-200 text-center">
        <p className="text-slate-400 text-sm">
          © {new Date().getFullYear()} <span className="font-semibold text-slate-600">Nandan Digital Studio</span>. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
