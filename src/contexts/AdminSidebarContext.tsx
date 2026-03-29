'use client';

import { createContext, useContext } from 'react';

interface AdminSidebarContextValue {
  open: () => void;
}

export const AdminSidebarContext = createContext<AdminSidebarContextValue>({
  open: () => {},
});

export function useAdminSidebar() {
  return useContext(AdminSidebarContext);
}
