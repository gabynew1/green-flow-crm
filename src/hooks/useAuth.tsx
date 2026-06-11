import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "PROVIDER_ADMIN" | "PROVIDER_STAFF" | "CLIENT_USER";

interface ProfileData {
  full_name: string | null;
  unique_client_id: string | null;
  tenant_id: string | null;
  email: string | null;
  customer_id: string | null;
  phone: string | null;
  company_name: string | null;
  cui: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  provider_permission: string | null;
  client_type: string;
  cnp: string | null;
  vat_id: string | null;
  address_county: string | null;
  address_city: string | null;
  address_street: string | null;
  address_number: string | null;
  fiscal_representative: string | null;
  temporary_password: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  profile: ProfileData | null;
  isProvider: boolean;
  isClient: boolean;
  isSuperAdmin: boolean;
  tenantId: string | null;
  isLocked: boolean;
  lockedSubject: { kind: 'tenant' | 'client'; status: string; scheduled_delete_at: string | null } | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [lockedSubject, setLockedSubject] = useState<{ kind: 'tenant' | 'client'; status: string; scheduled_delete_at: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) {
      setRoles(data.map((r) => r.role as AppRole));
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, unique_client_id, tenant_id, email, customer_id, phone, company_name, cui, contact_email, contact_phone, provider_permission, client_type, cnp, vat_id, address_county, address_city, address_street, address_number, fiscal_representative, temporary_password, email_verified, email_verified_at")
      .eq("user_id", userId)
      .single();
    if (data) {
      setProfile(data as ProfileData);
    }
  };

  const fetchSuperAdmin = async (userId: string) => {
    const { data } = await supabase.rpc("is_super_admin", { _user_id: userId });
    setIsSuperAdmin(!!data);
  };

  const LOCKED_STATUSES = ['soft_locked', 'flagged_for_deletion'];

  const touchAndCheckLock = async () => {
    try {
      await supabase.functions.invoke('lifecycle-touch-login', { body: {} });
    } catch (e) {
      console.warn('touch-login failed', e);
    }
    // Re-evaluate lock for current profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('tenant_id,customer_id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();
    if (prof?.tenant_id) {
      const { data: t } = await supabase.from('tenants')
        .select('status,scheduled_delete_at').eq('id', prof.tenant_id).maybeSingle();
      if (t && LOCKED_STATUSES.includes(t.status)) {
        setLockedSubject({ kind: 'tenant', status: t.status, scheduled_delete_at: t.scheduled_delete_at });
        return;
      }
    }
    if (prof?.customer_id) {
      const { data: c } = await supabase.from('customers')
        .select('status,scheduled_delete_at').eq('id', prof.customer_id).maybeSingle();
      if (c && LOCKED_STATUSES.includes(c.status)) {
        setLockedSubject({ kind: 'client', status: c.status, scheduled_delete_at: c.scheduled_delete_at });
        return;
      }
    }
    setLockedSubject(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchRoles(session.user.id);
            fetchProfile(session.user.id);
            fetchSuperAdmin(session.user.id);
            if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') {
              touchAndCheckLock();
            }
          }, 0);
        } else {
          setRoles([]);
          setProfile(null);
          setIsSuperAdmin(false);
          setLockedSubject(null);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
        fetchProfile(session.user.id);
        fetchSuperAdmin(session.user.id);
        touchAndCheckLock();
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setProfile(null);
    setLockedSubject(null);
  };

  const isProvider = roles.some((r) => r === "PROVIDER_ADMIN" || r === "PROVIDER_STAFF");
  const isClient = roles.includes("CLIENT_USER");
  const tenantId = profile?.tenant_id ?? null;
  const isLocked = !!lockedSubject;

  return (
    <AuthContext.Provider value={{ user, session, roles, profile, isProvider, isClient, isSuperAdmin, tenantId, isLocked, lockedSubject, isLoading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
