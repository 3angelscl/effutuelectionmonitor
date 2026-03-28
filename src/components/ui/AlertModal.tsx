'use client';

import { ExclamationCircleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import Button from './Button';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: 'error' | 'success' | 'info';
}

export default function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  variant = 'error',
}: AlertModalProps) {
  const icons = {
    error: <ExclamationCircleIcon className="h-6 w-6 text-red-500" />,
    success: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
    info: <InformationCircleIcon className="h-6 w-6 text-blue-500" />,
  };

  const bgColors = {
    error: 'bg-red-50',
    success: 'bg-green-50',
    info: 'bg-blue-50',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full ${bgColors[variant]} shrink-0`}>
            {icons[variant]}
          </div>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>OK</Button>
        </div>
      </div>
    </Modal>
  );
}
