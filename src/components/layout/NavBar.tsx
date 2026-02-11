"use client";

import { useBackendMutation, useBackendQuery } from "@/hooks/networking";
import { getToken, isUserAuthenticated, removeTokens } from "@/utils/auth";
import { SignIn, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NarrativeLogo } from "@/components/common/NarrativeLogo";

const AuthButton = () => {
  // FIXME: Locally NavBar does not re-render on change in Cookies, so below doesn't change
  // const isLoggedIn = isUserAuthenticated();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();

  
useEffect(()=>{
  setIsMounted(true);
  setIsLoggedIn(isUserAuthenticated())
}, [pathname])

  // FIXME: Remove this and "use client" once isUserAuthenticated is made SSR compatible
  const { mutate: logout } = useBackendMutation<{ refresh: string }, {}>(
    "auth/logout/",
    "POST",
    {
      shouldCacheResponse: false,
    },
  );

  const router = useRouter();
  const handleLogout = () => {
    const refresh = getToken("refresh");
    if (refresh) logout({ refresh: refresh });
    removeTokens();
    setIsLoggedIn(false);
    router.push("/login");
  };

  return (
    <>
      {!isMounted ? (
        <span />
      ) : isLoggedIn ? (
        <button
          className="flex items-center flex-shrink-0 gap-2 text-narrative-charcoal hover:text-narrative-green transition-colors duration-200 font-medium"
          onClick={() => handleLogout()}
        >
          <SignOut size={20} aria-hidden="true" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      ) : (
        <Link
          className="flex items-center flex-shrink-0 gap-2 text-narrative-charcoal hover:text-narrative-green transition-colors duration-200 font-medium"
          href="/login"
        >
          <SignIn size={20} aria-hidden="true" />
          <span className="hidden sm:inline">Login</span>
        </Link>
      )}
    </>
  );
};

const MenuItems = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = usePathname();

  // Check if user is authenticated
  useEffect(() => {
    setIsMounted(true);
    setIsLoggedIn(isUserAuthenticated());
  }, []);

  // Check admin status using the networking hook (only if logged in)
  const { data: adminCheck } = useBackendQuery<{
    is_admin: boolean;
    privileges: any;
  }>("admin/check/", {
    enabled: isLoggedIn && isMounted,
    shouldCacheResponse: false,
  });

  useEffect(() => {
    if (adminCheck) {
      setIsAdmin(adminCheck.is_admin);
    }
  }, [adminCheck]);

  const navItems = [
    { href: "/orgcharts", label: "Target Accounts", visible: true },
    { href: "/", label: "Messaging Plays", visible: true },
    { href: "/smart-variables", label: "Research Plays", visible: true },
    { href: "/analytics", label: "Analytics", visible: true },
    { href: "/batch-management", label: "Batch Management", visible: true },
    { href: "/settings", label: "Setup Company", visible: true },
    { href: "/profile", label: "Setup Profile", visible: true },
    { href: "/integrations", label: "Integrations", visible: true },
    { href: "/execute", label: "Execute Plays", visible: false }, // Hidden
  ];

  return (
    <div className="flex items-center">
      {/* Desktop Navigation - Sleek Tab Design */}
      <div className="hidden lg:flex bg-narrative-cream rounded-xl p-1 gap-1">
        {navItems.filter(item => item.visible).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                ${isActive 
                  ? 'bg-white text-narrative-green shadow-sm border border-narrative-green/10' 
                  : 'text-narrative-charcoal hover:text-narrative-green hover:bg-white/50'
                }
              `}
            >
              {item.label}
            </Link>
          );
        })}
        {isMounted && isLoggedIn && isAdmin && (
          <Link
            href="/admin"
            className={`
              px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap
              ${pathname === '/admin'
                ? 'bg-narrative-purple text-white shadow-sm'
                : 'text-narrative-purple hover:bg-white/50 hover:text-purple-600'
              }
            `}
          >
            🔧 Admin
          </Link>
        )}
      </div>
      
      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <select
          value={pathname}
          onChange={(e) => window.location.href = e.target.value}
          className="bg-narrative-cream border border-narrative-green/20 rounded-lg px-3 py-2 text-sm font-medium text-narrative-charcoal focus:ring-2 focus:ring-narrative-green focus:border-transparent"
        >
          {navItems.filter(item => item.visible).map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
          {isMounted && isLoggedIn && isAdmin && (
            <option value="/admin">🔧 Admin</option>
          )}
        </select>
      </div>
    </div>
  );
};

export const NavBar = () => {
  return (
    <nav className="bg-white border-b border-neutral-100 z-10 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="relative flex h-18 justify-between items-center py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center flex-shrink-0">
              <NarrativeLogo size="md" />
            </Link>
            <MenuItems />
          </div>
          <div className="flex items-center gap-4">
            <AuthButton />
          </div>
        </div>
      </div>
    </nav>
  );
};
