"use client";

import { PlayEditor } from "@/components/smart/PlayEditor";
import { PlayOutputType } from "@/models/play";

export default function Home() {
  return <PlayEditor playOutputType={PlayOutputType.FINAL} />;
}
