import { createContext, useContext, type ReactNode } from 'react';
import type { Group, MemberRole } from '@/types';

type GroupContextValue = {
  group: Group;
  myRole: MemberRole;
};

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

export function GroupProvider({
  group,
  myRole,
  children,
}: GroupContextValue & { children: ReactNode }) {
  return (
    <GroupContext.Provider value={{ group, myRole }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used inside GroupProvider');
  return ctx;
}
