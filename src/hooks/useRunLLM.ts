import { LLMResponse, LLMResponseBD } from "@/models/llm-response";
import { prepareToRunModel } from "@/utils/llm";
import { useBackendMutation } from "./networking";
import { useEffect, useRef, useState } from "react";
import { PlayOutputType, PlayStep } from "@/models/play";
import { Dictionary, difference, isEqual, merge, range } from "lodash";
import {formatString, ReplacedVariable} from "@/utils/string-interpolation";


function getMissingVariableNames(replacedVariables: ReplacedVariable[]): string[] {
  return replacedVariables.filter(v => v.isMissing && !v.isOptional).map(v => v.name);
}


export const useRunLLM = (
  playSteps: PlayStep[],
  allVariablesProp: Dictionary<string>,
  playOutputType: PlayOutputType = PlayOutputType.FINAL,
) => {
  // Any variables with an empty string, null, or undefined value should be removed
  const allVariables = Object.fromEntries(
    Object.entries(allVariablesProp)
      .filter(
        ([key, value]) => value !== "" && value !== null && value !== undefined,
      )
      .sort(),
  );

  const { mutateAsync: mutateLLMResponseAsync } = useBackendMutation<
    LLMResponseBD,
    LLMResponse
  >("llm-responses/", "POST", {
    shouldCacheResponse: false,
  });

  const [promptResponses, setPromptResponses] = useState<{
    [promptIndex: number]: LLMResponse | null;
  }>({});

  // -- Input Change Business Logic

  // If the variables change clear all responses
  useEffect(() => {
    setPromptResponses({});
  }, [JSON.stringify(allVariables)]);

  // If one or more playsteps change, Clear LLM Output of the step that changed,
  // plus output of any steps that used their output in their instructions
  // (and output of any steps that used those prompts outputs, and so on...)
  const prevPlaySteps = useRef<PlayStep[]>(playSteps);
  // If any of the following fields change in a playstep, we need to clear the output of that step
  const keysToCheck: (keyof PlayStep)[] = [
    "user_instructions_template",
    "system_instructions_template",
    "model_name",
    "model_provider",
  ];
  useEffect(() => {
    // Determine which playsteps changed
    let stepsToClear = prevPlaySteps.current
      .map((step, i) => {
        if (
          keysToCheck.some((key) => !isEqual(step[key], playSteps?.[i]?.[key]))
        ) {
          return i;
        } else {
          return null;
        }
      })
      .filter((i) => i !== null) as number[]; // We know there are no nulls b/c we filtered them

    // Figure out which prompts to clear
    while (true) {
      const addlSteps = stepsToClear
        .map(
          (index) =>
            playSteps
              .map((step, j) => {
                if (
                  step.system_instructions_template?.includes(
                    `{prompt_${index + 1}}`,
                  ) ||
                  step.user_instructions_template?.includes(
                    `{prompt_${index + 1}}`,
                  )
                ) {
                  return j;
                } else {
                  return null;
                }
              })
              .filter((i) => i !== null) as number[], // We know there are no nulls b/c we filtered them
        )
        .flat();
      const newSteps = difference(addlSteps, stepsToClear);
      if (newSteps.length === 0) break;
      stepsToClear = stepsToClear.concat(newSteps);
    }

    // Clear the prompts
    setPromptResponses((prev) => {
      const newPromptResponses = { ...prev };
      stepsToClear.forEach((index) => {
        delete newPromptResponses[index];
      });
      return newPromptResponses;
    });

    // Update the reference to the previous value
    prevPlaySteps.current = playSteps;
  }, [JSON.stringify(playSteps)]);

  // -- Single Prompt Run Business Logic

  const _availableVariablesForStep = (
    index: number,
    promptResponses: {
      [promptIndex: number]: LLMResponse | null;
    },
  ) => {
    const filteredArray = Object.entries(promptResponses).filter(
      ([key, value]) => Number(key) < index && value,
    ) as [string, LLMResponse][]; // Casting to [string, LLMResponse][] b/c I know we filtered out all the nulls
    const previousPromptOutputVariables = Object.fromEntries(
      filteredArray.map(([key, value]) => [
        `prompt_${parseInt(key) + 1}`,
        value.response,
      ]),
    );
    return merge({}, allVariables, previousPromptOutputVariables);
  };

  const _runLLMForStep = (
    index: number,
    promptResponses: {
      [promptIndex: number]: LLMResponse | null;
    },
  ) => {
    const playStep = playSteps[index];
    const allVariables = _availableVariablesForStep(index, promptResponses);
    const { isReady, compiledSystemInstructions, compiledUserInstructions } =
      prepareToRunModel(
        allVariables,
        playStep.user_instructions_template,
        playStep.system_instructions_template,
      );

    const data: LLMResponseBD = {
      system_instructions: compiledSystemInstructions,
      user_instructions: compiledUserInstructions,
      play_output_type: playOutputType,
    };
    if (playStep.model_provider && playStep.model_name) {
      data.model_provider = playStep.model_provider;
      data.model_name = playStep.model_name;
    }

    if (isReady && compiledSystemInstructions && compiledUserInstructions) {
      return mutateLLMResponseAsync(data).then((response) => {
        setPromptResponses((prev) => ({
          ...prev,
          [index]: response,
        }));
        return response;
      });
    } else {
      return Promise.reject();
    }
  };

  // Public API for running single LLM or computing availableVars will automatically leverage the promptResponses stored in state
  const runLLMForStep = (index: number) =>
    _runLLMForStep(index, promptResponses);
  const availableVariablesForStep = (index: number) =>
    _availableVariablesForStep(index, promptResponses);

  // -- Run All Business Logic

  const [isRunningAllSteps, setIsRunningAllPrompts] = useState<boolean>(false);

  // We are ready to run all steps if we have both system and user instructions and *the only missing vars are previous prompt outputs*
  // NOTE: This logic is different than isReady returned by prepareToRunModel
  const runAllReadyStatus = playSteps.map((playStep) => {
    const { replacedVariables: replacedSystemInstructionVariables } =
      formatString(playStep.system_instructions_template || "", allVariables);
    const { replacedVariables: replacedUserInstructionVariables } = formatString(
      playStep.user_instructions_template || "",
      allVariables,
    );
    const previousPromptVarsThatWillBeAvailable = range(
      playSteps.indexOf(playStep),
    ).map((i) => `prompt_${i + 1}`);

    const missingVariables = [
      ...getMissingVariableNames(replacedSystemInstructionVariables).filter(
        (string) => !previousPromptVarsThatWillBeAvailable.includes(string),
      ),
      ...getMissingVariableNames(replacedUserInstructionVariables).filter(
        (string) => !previousPromptVarsThatWillBeAvailable.includes(string),
      ),
    ];

    const isReady =
      playStep.system_instructions_template &&
      playStep.user_instructions_template &&
      missingVariables.length === 0;

    return { isReady, missingVariables };
  });

  // Public API for getting ready status of running multiple prompts
  const isStepReadyToRun = (index: number) => runAllReadyStatus[index].isReady;
  const isReadyToRunAllSteps =
    runAllReadyStatus.every((status) => status.isReady) && !isRunningAllSteps;
  const missingVariables = runAllReadyStatus.reduce<string[]>(
    (acc, status) => [...acc, ...status.missingVariables],
    [],
  );

  const runAllSteps = () => {
    // Need to make sure they run in order as some prompts may depend on the output of previous prompts
    // Need a delay in between each call to allow the state to update and pass the new output to the next prompt
    if (!isReadyToRunAllSteps) return;
    setIsRunningAllPrompts(true);
    let promiseChain = Promise.resolve({ ...promptResponses });
    playSteps.forEach((_, index) => {
      // Skip if we already have a response
      if (promptResponses[index]) return;
      promiseChain = promiseChain.then((cumulativePromptResponses) => {
        return _runLLMForStep(index, cumulativePromptResponses).then(
          (newResponse) => ({
            ...cumulativePromptResponses,
            [index]: newResponse,
          }),
        );
      });
    });
    promiseChain.finally(() => setIsRunningAllPrompts(false));
  };

  return {
    promptResponses,
    runLLMForStep,
    availableVariablesForStep,
    isRunningAllSteps,
    isStepReadyToRun,
    isReadyToRunAllSteps,
    runAllSteps,
    missingVariables,
  };
};
