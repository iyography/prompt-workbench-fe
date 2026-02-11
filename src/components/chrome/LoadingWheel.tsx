import "@/app/globals.css";

import { useEffect, useState } from "react";

const RESEARCH_VARIABLES = [
  "Persona",
  "LinkedIn",
  "CRM",
  "Google",
  "Websites",
  "News",
  "Company",
];

const CREATIVE_STEPS = [
  "Account Details",
  "Persona Content",
  "Best Practices",
  "Personalization",
  "Key Players",
  "Relationships",
  "Storytelling Framework",
];

// Animation will actually take 100ms less than this value with final 100ms used for cleanup when the animation is done
const TRANSITION_DURATION_MS = 1000;

type LoadingStep = "research" | "creative";

const CONTENT = {
  research: {
    title: "Sit tight while we figure out the best plays for you.",
    verb: "Analyzing",
    nouns: RESEARCH_VARIABLES,
  },
  creative: {
    title: "Creating messaging...",
    verb: "Viewing",
    nouns: CREATIVE_STEPS,
  },
};

export const LoadingWheel = ({ step }: { step: LoadingStep }) => {
  const nouns = CONTENT[step].nouns;

  const [index, setIndex] = useState(0);
  const [restart, setRestart] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRestart(false);
      setIndex((count) => count + 1);
    }, TRANSITION_DURATION_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (index >= nouns.length) {
      setTimeout(() => {
        setIndex(0);
        setRestart(true);
      }, TRANSITION_DURATION_MS - 50);
    }
  }, [index]);

  return (
    <div className="p-4 h-full w-full flex flex-col items-center justify-center text-white">
      <div className="flex flex-col items-center justify-center flex-grow">
        <div>
          <p className="text-3xl font-bold text-center mb-12">
            {CONTENT[step].title}
          </p>
          <div className="w-full flex gap-2 text-lg min-[400px]:text-xl font-medium h-[220px] overflow-hidden opacity-fade-in-fade-out-y">
            <div className="flex-grow basis-0 flex items-center justify-end">
              ✨ {CONTENT[step].verb}
            </div>
            <div className="flex-grow basis-0 flex items-center justify-start">
              <Wheel {...{ nouns, index, restart, step }} />
            </div>
          </div>
        </div>
      </div>
      <p className="text-xl font-medium flex-shrink-0 flex-grow-0">
        Narrative AI
      </p>
    </div>
  );
};

const Wheel = ({
  index,
  nouns,
  restart,
  step,
}: {
  index: number;
  nouns: string[];
  restart: boolean;
  step: LoadingStep;
}) => {
  return step === "research" ? (
    <div
      className={`mt-[168px]`}
      style={{
        transform: `translate(0, -${(index / nouns.length) * 33.333}%)`,
        transition: `transform ${restart ? 0 : TRANSITION_DURATION_MS - 100}ms`,
      }}
    >
      {[...nouns, ...nouns, ...nouns].map((variable, i) => (
        <p key={variable + i}>{variable}</p>
      ))}
    </div>
  ) : (
    <div
      className={`mt-[198px]`}
      style={{
        transform: `translate(0, -${(index / nouns.length) * 29}%)`,
        transition: `transform ${restart ? 0 : TRANSITION_DURATION_MS - 100}ms`,
      }}
    >
      {[...nouns, ...nouns, ...nouns].map((variable, i) => (
        <p key={variable + i}>{variable}</p>
      ))}
    </div>
  );
};
