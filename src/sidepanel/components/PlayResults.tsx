import { IconButton } from "../../components/common/IconButton";
import { ArrowLeft, CopySimple } from "@phosphor-icons/react";
import { Play, RunFinalPlayResponseType } from "../../models/play";
import { MouseEvent, useState } from "react";
import classNames from "classnames";

interface PlayResultsProps {
  selectedPlay: Play;
  playResponses: Record<string, RunFinalPlayResponseType>;
  onBack: () => void;
  runPlay: (numOutputsOverride?: number) => void;
  runError: Error | null;
}

export function PlayResults({
  selectedPlay,
  playResponses,
  onBack,
  runPlay,
  runError,
}: PlayResultsProps) {
  const [showCopiedOnIndex, setShowCopiedOnIndex] = useState<number | null>(
    null,
  );

  const copyToClipboard = (
    e: MouseEvent<HTMLButtonElement>,
    text: string,
    index: number,
  ) => {
    setShowCopiedOnIndex(index);
    navigator.clipboard.writeText(text);
    e.stopPropagation();
  };

  const results = playResponses[selectedPlay.id];

  if (!results) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="text-secondary flex items-center gap-1 w-fit hover:opacity-80"
      >
        <ArrowLeft size={16} weight="bold" /> Research
      </button>
      <div className="flex flex-col divide-y divide-gray-200">
        {results.map((result, i) => (
          <div
            key={i}
            className={classNames(
              "flex flex-col gap-4 pb-6",
              i !== 0 ? "pt-6" : "",
            )}
          >
            <div className="flex gap-2 items-center">
              <h2 className="text-lg font-semibold">Option {i + 1}</h2>
              <IconButton
                Icon={CopySimple}
                size={20}
                className="hover:bg-gray-100 rounded-full p-1"
                onClick={(e) => (result ? copyToClipboard(e, result, i) : null)}
              />
              {showCopiedOnIndex === i && (
                <p className="text-secondary text-sm">Copied!</p>
              )}
            </div>
            {result ? (
              <div className="whitespace-pre-line text-gray-700">{result}</div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="error text-red-600">
                  ⛔️ There was an error running this play. Please contact
                  support with the play name and we&apos;ll look into the issue.
                </p>
                <button
                  className="btn-primary w-fit h-fit px-4 py-2 rounded-lg"
                  onClick={() => runPlay()}
                >
                  Re-Run Play
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {runError && (
        <p className="error text-red-600 p-4 bg-red-50 rounded-lg">
          ⛔️ {runError.message}
        </p>
      )}
    </div>
  );
}
