"use client";

import { Suspense } from "react";
import { useQueryState } from "nuqs";
import { LoginForm } from "./LoginForm";

function Login() {
  const [queryError, setQueryError] = useQueryState("error");

  const handleLoginSuccess = () => {
    // Use window.location.href to force a full page reload
    // This ensures server-side middleware can read the cookies that were just set
    window.location.href = "/";
  };

  return (
    <LoginForm
      onSuccess={handleLoginSuccess}
      queryError={queryError}
      setQueryError={setQueryError}
    />
  );
}

// FIXME: This is obviously not great, but app would not compile w/o it b/c we are using useQueryState which uses useSearchParams
export default function SuspenseLogin() {
  return (
    // You could have a loading skeleton as the `fallback` too
    <Suspense>
      <Login />
    </Suspense>
  );
}
