"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Image as ImageIcon, ArrowRight, ArrowLeft } from "lucide-react";
import FileUpload from "@/components/FileUpload";
import PhotoEditor from "@/components/PhotoEditor";

export default function Home() {
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<"landing" | "photo">("landing");
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

  const handleFileSelect = (file: File, mode: "photo") => {
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
    // Note: We keep the viewMode as 'photo' so the user stays in that section
  };

  const fullReset = () => {
    setActiveFile(null);
    setViewMode("landing");
    setImageSrc(null);
  };

  return (
    <main className="min-h-screen pt-8 pb-32 px-4">
      {/* Navbar */}
      <nav className="max-w-[1550px] mx-auto flex items-center justify-between mb-16 px-4">
        <div className="flex items-center gap-0 group cursor-pointer hover:opacity-95 transition-all">
          <div className="flex flex-col">
            <span className="text-3xl font-black tracking-tight text-slate-900 leading-none">
              Nandan <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">Digital Studio</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-2">
              Elite Photography & Print Studio
            </span>
          </div>
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
              Transform Your <span className="text-gradient">Photos & Visuals</span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
              Pro-grade cropping, AI background removal, and professional image tuning. 
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
              className="max-w-xl mx-auto flex flex-col"
            >
              <div className="mb-4 flex items-center justify-center gap-3 text-slate-800 font-bold uppercase tracking-wider text-xs">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                Nandan Digital Studio
              </div>
              <FileUpload
                onFileSelect={(f) => handleFileSelect(f, "photo")}
                accept="image/*"
                label="Upload Photos to Edit"
              />
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
                    <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm flex items-center justify-center">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    Nandan Digital Studio
                  </h2>
                  <FileUpload
                    onFileSelect={(f) => handleFileSelect(f, "photo")}
                    accept="image/*"
                    label="Select New Photo"
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
              title: "Pro-Grade Export",
              desc: "Download your final images in pristine print-ready high resolution quality.",
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
