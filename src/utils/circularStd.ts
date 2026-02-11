import localFont from "next/font/local";

export const circularStd = localFont({
  src: [
    {
      path: "../../public/fonts/CircularStd-Book.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/CircularStd-Bold.woff",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/CircularStd-Black.woff",
      weight: "900",
      style: "normal",
    },
    {
      path: "../../public/fonts/CircularStd-Medium.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/CircularStd-BookItalic.woff",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/CircularStd-BoldItalic.woff",
      weight: "700",
      style: "italic",
    },
    {
      path: "../../public/fonts/CircularStd-BlackItalic.woff",
      weight: "900",
      style: "italic",
    },
    {
      path: "../../public/fonts/CircularStd-MediumItalic.woff",
      weight: "500",
      style: "italic",
    },
  ],
  variable: "--font-circular-std",
});
