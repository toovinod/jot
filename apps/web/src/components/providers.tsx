"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { getMe, getConfig, ApiError } from "@/lib/api";
import type { User, Config } from "@jot/contracts";
const Context = createContext<{
  user: User | null;
  loading: boolean;
  authError: string | null;
  config: Config;
  configError: string;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
}>({
  user: null,
  loading: true,
  authError: null,
  config: { aiEnabled: false, emailEnabled: false },
  configError: "",
  setUser: () => {},
  refresh: async () => {},
});
export const useSession = () => useContext(Context);
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState<string | null>(null),
    [config, setConfig] = useState<Config>({ aiEnabled: false, emailEnabled: false }),
    [configError, setConfigError] = useState("");
  const configVersion = useRef(0);
  const sessionVersion = useRef(0);
  function setUser(nextUser: User | null) {
    sessionVersion.current += 1;
    setUserState(nextUser);
    setAuthError(null);
    setLoading(false);
    try {
      localStorage.setItem("jot:session-changed", `${Date.now()}:${Math.random()}`);
    } catch {}
  }
  async function refresh() {
    const version = ++sessionVersion.current;
    try {
      const account = await getMe();
      if (version !== sessionVersion.current) return;
      setUserState(account);
      setAuthError(null);
    } catch (error) {
      if (version !== sessionVersion.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUserState(null);
        setAuthError(null);
      } else setAuthError(error instanceof Error ? error.message : "Could not check your session");
    } finally {
      if (version === sessionVersion.current) setLoading(false);
    }
  }
  async function refreshConfiguration() {
    const version = ++configVersion.current;
    try {
      const next = await getConfig();
      if (version !== configVersion.current) return;
      setConfig(next);
      setConfigError("");
    } catch {
      if (version === configVersion.current)
        setConfigError(
          "Integration settings could not be checked. Return to this tab or refresh the page to retry.",
        );
    }
  }
  useEffect(() => {
    void refresh();
    const refreshSession = () => {
      void refresh();
      void refreshConfiguration();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "jot:session-changed") refreshSession();
    };
    window.addEventListener("focus", refreshSession);
    window.addEventListener("storage", onStorage);
    void refreshConfiguration();
    return () => {
      window.removeEventListener("focus", refreshSession);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Context.Provider value={{ user, loading, authError, config, configError, setUser, refresh }}>
        {children}
        <Toaster richColors position="bottom-right" />
      </Context.Provider>
    </ThemeProvider>
  );
}
