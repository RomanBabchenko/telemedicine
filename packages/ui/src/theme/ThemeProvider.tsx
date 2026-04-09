import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';

export interface TenantTheme {
  brandName: string;
  primaryColor: string;
  logoUrl: string | null;
}

const ThemeContext = createContext<TenantTheme | null>(null);

interface Props {
  theme: TenantTheme | null;
  children: ReactNode;
}

export const ThemeProvider = ({ theme, children }: Props) => {
  useEffect(() => {
    if (!theme) return;
    document.documentElement.style.setProperty('--color-primary', theme.primaryColor);
    document.title = theme.brandName;
  }, [theme]);

  const value = useMemo(() => theme, [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): TenantTheme | null => useContext(ThemeContext);
