import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export interface ToastMessage {
  id: number;
  message: string;
  tone: "success" | "error";
}

export function ToastRegion({ messages }: { messages: ToastMessage[] }) {
  return <div className="toastRegion"><AnimatePresence>{messages.map((toast) => <motion.div key={toast.id} className={`toast ${toast.tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}><span>{toast.tone === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span>{toast.message}</motion.div>)}</AnimatePresence></div>;
}
