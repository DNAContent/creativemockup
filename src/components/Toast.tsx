"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

// Lightweight toast + confirm replacement for window.alert/confirm. Mounted
// once via <ToastProvider> in the root layout; components call useToast().
//
//   const { toast, confirm } = useToast();
//   toast("Saved", "success");
//   if (await confirm("Delete this?")) { ... }

type ToastType = "error" | "success" | "info";
type ToastItem = { id: number; message: string; type: ToastType };
type ConfirmState = {
  message: string;
  resolve: (ok: boolean) => void;
} | null;

type ToastApi = {
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string) => Promise<boolean>;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const TONE: Record<ToastType, string> = {
  error: "border-red-500/30 bg-red-600 text-white",
  success: "border-green-200 bg-green-600 text-white",
  info: "border-neutral-700 bg-neutral-900 text-white",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      4000,
    );
  }, []);

  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) =>
        setConfirmState({ message, resolve }),
      ),
    [],
  );

  function settle(ok: boolean) {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-toast pointer-events-auto max-w-sm rounded-lg border px-4 py-2.5 text-sm shadow-lg ${TONE[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="animate-scale-in w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
          >
            <p className="text-sm text-neutral-200">{confirmState.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={() => settle(true)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
