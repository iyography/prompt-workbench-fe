// Code taken directly from this guide on setting up authentication for NextJS + Django Rest
// See: https://dev.to/koladev/fullstack-nextjs-django-authentication-django-rest-typescript-jwt-wretch-djoser-2pcf

import Cookies from "js-cookie";

// Note: HttpOnly cookies can only be set by the server, not JavaScript.
// For enhanced security, consider moving token management to server-side
// using Next.js API routes that can set HttpOnly cookies.

const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';

/**
 * Stores a token in cookies.
 * @param {string} token - The token to be stored.
 * @param {"access" | "refresh"} type - The type of the token (access or refresh).
 */
export const storeToken = (token: string, type: "access" | "refresh") => {
  Cookies.set(type + "Token", token, {
    path: "/",
    sameSite: "lax",  // Changed from strict to allow normal navigation
    secure: isProduction,  // Only send over HTTPS in production
    expires: type === "refresh" ? 7 : 1,  // Refresh token: 7 days, Access token: 1 day
  });
};

/**
 * Retrieves a token from cookies.
 * @param {"access" | "refresh"} type - The type of the token to retrieve (access or refresh).
 * @returns {string | undefined} The token, if found.
 */
export const getToken = (type: string) => {
  return Cookies.get(type + "Token");
};

/**
 * Convinience function for checking if an access token is set.
 * @returns {boolean} True if user is logged in, false otherwise.
 */
export const isUserAuthenticated = () => {
  return getToken("access") !== undefined;
};

/**
 * Removes both access and refresh tokens from cookies.
 */
export const removeTokens = () => {
  Cookies.remove("accessToken", { path: "/" });
  Cookies.remove("refreshToken", { path: "/" });
};
