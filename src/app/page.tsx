"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Crop, Wand2, Download, ShieldCheck } from "lucide-react";
import FileUpload from "@/components/FileUpload";
import PhotoEditor from "@/components/PhotoEditor";

const FEATURES = [
  {
    icon: Crop,
    title: "Precise cropping",
    desc: "Print presets like 1.2\u2033\u00d71.5\u2033 and 4\u2033\u00d76\u2033, plus custom dimensions in inches, cm, or pixels.",
  },
  {
    icon: Wand2,
    title: "Background removal",
    desc: "On-device AI cuts out the subject. Your images never leave the browser.",
  },
  {
    icon: Download,
    title: "Print-ready export",
    desc: "Export lossless PNG or high-quality JPEG at the resolution you choose.",
  },
];

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
    <main className="min-h-screen pb-24">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <nav className="max-w-[1550px] mx-auto flex items-center justify-between px-6 py-4">
          <button
            onClick={fullReset}
            className="flex items-center gap-2.5 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-bold">
              N
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-base font-semibold tracking-tight text-slate-900">
                Nandan Digital Studio
              </span>
              <span className="mt-1 text-[11px] font-medium text-slate-400">
                Photo editor
              </span>
            </span>
          </button>

          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Runs in your browser
          </span>
        </nav>
      </header>

      <div className="px-6 pt-12">
        <AnimatePresence>
          {viewMode === "landing" && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="max-w-2xl mx-auto text-center mb-12"
            >
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900">
                Edit and prepare photos for print
              </h1>
              <p className="mt-4 text-base md:text-lg text-slate-500 leading-relaxed">
                Crop to standard print sizes, remove backgrounds with on-device AI, fine-tune,
                and export in high resolution. Nothing is uploaded to a server.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Workspace */}
        <section className="max-w-[1550px] mx-auto">
          <AnimatePresence mode="wait">
            {viewMode === "landing" ? (
              <motion.div
                key="landing-view"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="max-w-xl mx-auto"
              >
                <FileUpload
                  onFileSelect={(f) => handleFileSelect(f, "photo")}
                  accept="image/*"
                  label="Upload a photo to edit"
                />
              </motion.div>
            ) : viewMode === "photo" ? (
              <motion.div
                key="photo-studio-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {activeFile && imageSrc ? (
                  <PhotoEditor imageSrc={imageSrc} onReset={reset} />
                ) : (
                  <div className="max-w-xl mx-auto text-center">
                    <button
                      onClick={fullReset}
                      className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back to home
                    </button>
                    <FileUpload
                      onFileSelect={(f) => handleFileSelect(f, "photo")}
                      accept="image/*"
                      label="Select a new photo"
                    />
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Features */}
        {viewMode === "landing" && (
          <section className="max-w-5xl mx-auto mt-24 grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="glass rounded-xl p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{feat.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </section>
        )}

        {/* Footer */}
        <footer className="max-w-[1550px] mx-auto mt-24 pt-8 border-t border-slate-200">
          <p className="text-center text-sm text-slate-400">
            &copy; {new Date().getFullYear()} Nandan Digital Studio
          </p>
        </footer>
      </div>
    </main>
  );
}
