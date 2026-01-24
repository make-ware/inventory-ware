'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
};

type ConfirmContextType = {
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = React.createContext<ConfirmContextType | undefined>(
  undefined
);

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmOptions>({});
  const [resolveRef, setResolveRef] = React.useState<
    ((value: boolean) => void) | null
  >(null);
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);

  const confirm = React.useCallback((options: string | ConfirmOptions) => {
    const opts =
      typeof options === 'string' ? { description: options } : options;
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolveRef(() => resolve);
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolveRef?.(true);
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef?.(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(newOpen) => {
          if (!newOpen) handleCancel();
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            confirmButtonRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleCancel();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {options.title || 'Are you sure?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {options.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options.cancelText || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              ref={confirmButtonRef}
              onClick={handleConfirm}
              className={
                options.variant === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {options.confirmText || 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = React.useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context;
}
