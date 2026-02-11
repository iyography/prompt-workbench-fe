import { useForm } from "react-hook-form";
import { storeToken } from "@/utils/auth";
import { callBackend } from "@/hooks/networking";
import { LoginBD, LoginResponse } from "@/models/auth";
import { useEffect, useState } from "react";
import { NarrativeLogo } from "@/components/common/NarrativeLogo";

export const LoginForm = ({
  onSuccess,
  queryError,
  setQueryError,
}: {
  onSuccess?: () => void;
  queryError?: string | null;
  setQueryError?: (value: string | null) => void;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginBD>();

  useEffect(() => {
    if (queryError === "timeout" && setQueryError) {
      setError("root", {
        type: "manual",
        message:
          "Your session has expired. Please log in again. If you see this message frequently, please contact support.",
      });
      setQueryError(null);
    }
  }, [queryError, setError, setQueryError]);

  const onSubmit = async (data: LoginBD) => {
    if (isSubmitting) return; // Prevent double submission
    
    setIsSubmitting(true);
    try {
      const response = await callBackend<LoginBD, LoginResponse>("auth/jwt/create", {
        method: "POST",
        data,
      });
      
      storeToken(response.access, "access");
      storeToken(response.refresh, "refresh");

      if (onSuccess) {
        // Call onSuccess immediately - no need for setTimeout
        onSuccess();
      }
    } catch (err: any) {
      setError("root", { type: "manual", message: err.message || "Login failed. Please try again." });
      setIsSubmitting(false);
    }
  };

  // TODO: Add forgot password and signup pages
  // TODO: Disable button if missing data

  return (
    <div className="outer-container flex items-center justify-center w-full min-h-screen bg-narrative-cream">
      <div className="px-8 py-8 text-center bg-white shadow-lg border border-neutral-100 max-w-md w-full rounded-xl">
        <div className="mb-8">
          <NarrativeLogo size="lg" className="mx-auto" />
        </div>
        <h1 className="text-2xl font-bold text-narrative-charcoal mb-2">Welcome back</h1>
        <p className="text-secondary mb-6">Sign in to your account to continue</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
          <div>
            <label htmlFor="username">Username</label>
            <input
              type="text"
              placeholder="Username"
              {...register("username", { required: true })}
              className="w-full primary-input mt-2"
            />
            {errors.username && (
              <span className="text-xs text-red-600">Username is required</span>
            )}
          </div>
          <div className="mt-4">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              placeholder="Password"
              {...register("password", { required: true })}
              className="w-full primary-input mt-2"
            />
            {errors.password && (
              <span className="text-xs text-red-600">Password is required</span>
            )}
          </div>

          {errors.root && (
            <div className="mt-4 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
              {errors.root.message}
            </div>
          )}

          <div className="mt-6">
            <button 
              type="submit" 
              className="w-full bg-narrative-green hover:bg-narrative-mid-green text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};