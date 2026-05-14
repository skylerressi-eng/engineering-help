import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useAiStore } from '@/store/aiStore';

export default function AiFloatingButton() {
  const open = useAiStore((s) => s.open);
  const toggleChat = useAiStore((s) => s.toggleChat);

  return (
    <AnimatePresence>
      {!open && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          onClick={toggleChat}
          title="EngOS AI (Cmd+I)"
          className="fixed right-6 z-[6500] w-14 h-14 rounded-full flex items-center justify-center shadow-window border border-white/15 overflow-hidden"
          style={{
            bottom: 96,
            background: 'linear-gradient(135deg, #f0abfc 0%, #c084fc 35%, #ec4899 100%)',
          }}
        >
          <div className="absolute inset-0 rounded-full animate-pulse-soft" style={{
            boxShadow: '0 0 32px 6px rgba(236, 72, 153, 0.45)',
          }} />
          <Sparkles size={22} className="text-white drop-shadow relative z-10" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
