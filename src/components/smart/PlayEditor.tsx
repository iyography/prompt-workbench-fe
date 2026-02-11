"use client";

import React from "react";
import { DictionaryTable } from "@/components/common/DictionaryTable";
import { TextArea } from "@/components/common/TextArea";
import { SearchSelectModal } from "@/components/modals/SearchSelectModal";
import { useBackendMutation, useBackendQuery, useUpdateUserPlayPreference, useUserPlayPreference } from "@/hooks/networking";
import { LLMResponse } from "@/models/llm-response";
import { ChangeEventHandler, Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Dictionary, findKey, isEqual, merge, range } from "lodash";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconButton } from "@/components/common/IconButton";
import { Play, PlayOutputType, PlayStep } from "@/models/play";
import { SavePlayModal } from "@/components/modals/SavePlayModal";
import { DotsSix, Pencil, Trash } from "@phosphor-icons/react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";
import { GetLinkedInData } from "@/components/smart/GetLinkedInData";
import { prepareToRunModel } from "@/utils/llm";
import { useRunLLM } from "@/hooks/useRunLLM";
import { BaseModal } from "../modals/BaseModal";
import { Dropdown } from "../common/Dropdown";
import { LinkedInProfile } from "@/models/linkedin-profile";
import { getSet } from "@/utils/variable-sets";
import { useCompanyAndProfileVariables } from "@/hooks/useCompanyAndProfileVariables";
import { useQueryClient } from "@tanstack/react-query";

import { useOnboardingVariables } from "@/hooks/useOnboardingVariables";

const PromptInstructionsPreview = ({
  compiledInstructions,
  missingVariables,
  label,
}: {
  compiledInstructions?: string;
  missingVariables?: string[];
  label?: string;
}) => (
  <div className="flex flex-col gap-2">
    {label && <label>{label}</label>}
    {!compiledInstructions ? (
      <p className="error">⛔️ Enter instructions.</p>
    ) : missingVariables && missingVariables.length > 0 ? (
      <p className="error text-wrap w-full">
        ⛔️ Set the following missing variables to generate prompts:{" "}
        {missingVariables.map((variable) => (
          <Fragment key={variable}>
            <code key={variable}>{variable}</code>
            <span className="last:hidden">, </span>
          </Fragment>
        ))}
      </p>
    ) : (
      <pre className="mb-2">{compiledInstructions}</pre>
    )}
  </div>
);

export const LLMPrompt = ({
  playStep,
  setPlayStep,
  variables,
  output,
  runModel,
  isReadyToRunAllSteps,
  runAllSteps,
  currentGuaranteedVariable,
  isBatchUnsaved,
}: {
  playStep: PlayStep;
  setPlayStep: (playStep: PlayStep) => void;
  variables: Dictionary<string>;
  output: LLMResponse | null;
  runModel: () => Promise<LLMResponse>;
  runAllSteps: () => void;
  isReadyToRunAllSteps: boolean;
  currentGuaranteedVariable: string | null;
  isBatchUnsaved: boolean;
}) => {
  const [isRunningModel, setIsRunningModel] = useState<boolean>(false);
  const [errorRunningModel, setErrorRunningModel] = useState<Error | null>(
    null,
  );
  const [showCompiledPrompt, setShowCompiledPrompt] = useState<boolean>(false);
  const [showHiddenDirective, setShowHiddenDirective] = useState<boolean>(false);

  // Refs to store previous elements for cleanup
  const previousSystemTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousUserTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Helper function to manually insert space character at cursor position
  const insertSpaceAtCursor = useCallback((textarea: HTMLTextAreaElement) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const newValue = value.substring(0, start) + ' ' + value.substring(end);
    textarea.value = newValue;
    // Restore cursor position after the inserted space
    textarea.selectionStart = textarea.selectionEnd = start + 1;
    // Trigger input event to update React state - use InputEvent for better React compatibility
    const inputEvent = new InputEvent('input', { 
      bubbles: true, 
      cancelable: true,
      inputType: 'insertText',
      data: ' '
    });
    textarea.dispatchEvent(inputEvent);
  }, []);

  // Native event listener handler for spacebar
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // If spacebar is pressed, stop immediate propagation to prevent drag-and-drop library from handling it
    if (e.key === ' ' || e.keyCode === 32) {
      const target = e.target as HTMLTextAreaElement;
      // Stop all other listeners from handling this event
      e.stopImmediatePropagation();
      // Also stop propagation to prevent bubbling
      e.stopPropagation();
      
      // If default was prevented by another handler, manually insert the space
      // Use setTimeout to check after other handlers have run
      setTimeout(() => {
        if (target && e.defaultPrevented) {
          insertSpaceAtCursor(target);
        }
      }, 0);
      
      // Don't prevent default ourselves - let the space character be inserted naturally
    }
  }, [insertSpaceAtCursor]);

  // Callback ref for system instructions textarea - attaches listener when element is mounted
  const setSystemInstructionsTextareaRef = useCallback((element: HTMLTextAreaElement | null) => {
    // Cleanup previous element if it exists
    if (previousSystemTextareaRef.current) {
      previousSystemTextareaRef.current.removeEventListener('keydown', handleKeyDown, true);
    }
    
    // Store new element
    previousSystemTextareaRef.current = element;
    
    // Attach listener to new element if it exists
    if (element) {
      element.addEventListener('keydown', handleKeyDown, true);
    }
  }, [handleKeyDown]);

  // Callback ref for user instructions textarea - attaches listener when element is mounted
  const setUserInstructionsTextareaRef = useCallback((element: HTMLTextAreaElement | null) => {
    // Cleanup previous element if it exists
    if (previousUserTextareaRef.current) {
      previousUserTextareaRef.current.removeEventListener('keydown', handleKeyDown, true);
    }
    
    // Store new element
    previousUserTextareaRef.current = element;
    
    // Attach listener to new element if it exists
    if (element) {
      element.addEventListener('keydown', handleKeyDown, true);
    }
  }, [handleKeyDown]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previousSystemTextareaRef.current) {
        previousSystemTextareaRef.current.removeEventListener('keydown', handleKeyDown, true);
      }
      if (previousUserTextareaRef.current) {
        previousUserTextareaRef.current.removeEventListener('keydown', handleKeyDown, true);
      }
    };
  }, [handleKeyDown]);

  const onClickRunModel = async () => {
    setIsRunningModel(true);
    setErrorRunningModel(null);
    runModel()
      .then(() => {})
      .catch((error) => {
        setErrorRunningModel(error);
      })
      .finally(() => {
        setIsRunningModel(false);
      });
  };

  // Input State is stored in parent component state
  const systemInstructions = playStep.system_instructions_template || "";
  // Regex and helpers to hide guaranteed directive from UI but keep it persisted
  const GUARDED_LINE_REGEX = /(\(Ignore this: Guaranteed variable: \{[^}]+\}\)\s*)/g;
  const stripGuaranteedLine = (text: string): string => text.replace(GUARDED_LINE_REGEX, "").trim();
  const withGuaranteedLine = (textWithout: string, variable: string | null): string => {
    const base = (textWithout || "").trim();
    if (!variable) return base;
    // Append canonical directive at the end
    return base ? `${base}\n\n(Ignore this: Guaranteed variable: {${variable}})` : `(Ignore this: Guaranteed variable: {${variable}})`;
  };
  const setSystemInstructions = (newSystemInstructions: string) => {
    setPlayStep({
      ...playStep,
      system_instructions_template: newSystemInstructions,
    });
  };

  const getBatchLabel = (variable: string | null): { label: string; className: string } => {
    switch (variable) {
      case "company_enrichment_guaranteed":
        return { label: "Company Enrichment", className: "bg-blue-100 text-blue-800 border-blue-200" };
      case "hubspot_guaranteed":
        return { label: "HubSpot", className: "bg-amber-100 text-amber-800 border-amber-200" };
      case "linkedin_posts_guaranteed":
        return { label: "LinkedIn Posts", className: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200" };
      case "linkedin_jobs_guaranteed":
        return { label: "LinkedIn Jobs", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
      case "linkedin_profile_guaranteed":
      default:
        return { label: "Default", className: "bg-slate-100 text-slate-800 border-slate-200" };
    }
  };

  const userInstructions = playStep.user_instructions_template || "";
  const setUserInstructions = (newUserInstructions: string) => {
    setPlayStep({
      ...playStep,
      user_instructions_template: newUserInstructions,
    });
  };

  const modelProvider = playStep.model_provider;
  const setModelProvider = (newModelProvider: string) => {
    const copy = { ...playStep };
    delete copy.model_name;

    setPlayStep({
      ...copy,
      model_provider: newModelProvider,
    });
  };
  const removeModelProvider = () => {
    const copy = { ...playStep };
    delete copy.model_provider;
    delete copy.model_name;
    setPlayStep(copy);
  };
  const MODEL_PROVIDER_DROPDOWN_OPTIONS = [
    { id: "default", label: "Default" },
    { id: "openai", label: "Open AI" },
    { id: "anthropic", label: "Anthropic" },
    { id: "perplexity", label: "Perplexity" },
  ];

  const modelName = playStep.model_name;
  const setModelName = (newModelName: string) => {
    const copy = { ...playStep };
    if (newModelName === "default") {
      delete copy.model_name;
    } else {
      copy.model_name = newModelName;
    }
    setPlayStep({
      ...copy,
    });
  };

  const { data: llmModels, isLoading: loadingModels } =
    useBackendQuery<{ name: string; provider: string }[]>("llm-models/");

  const {
    isReady,
    compiledSystemInstructions,
    compiledUserInstructions,
    missingSystemInstructionsVariables,
    missingUserInstructionsVariables,
  } = prepareToRunModel(variables, userInstructions, systemInstructions);

  const modelsForProvider =
    llmModels
      ?.filter((model) => model.provider === playStep.model_provider)
      .map((model) => ({ id: model.name, label: model.name })) || [];

  modelsForProvider.push({ id: "default", label: "Default" });

  return (
    <>
      <BaseModal
        show={showCompiledPrompt}
        onClose={() => setShowCompiledPrompt(false)}
      >
        <div className="px-8 py-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-2">
            <input
              id="toggle_batch_directive"
              type="checkbox"
              className="h-4 w-4"
              checked={showHiddenDirective}
              onChange={(e) => setShowHiddenDirective(e.target.checked)}
            />
            <label htmlFor="toggle_batch_directive" className="text-sm">
              Show hidden batch directive
            </label>
          </div>
          <PromptInstructionsPreview
            compiledInstructions={showHiddenDirective ? compiledSystemInstructions : stripGuaranteedLine(compiledSystemInstructions || "")}
            missingVariables={missingSystemInstructionsVariables}
            label="System instructions that will be passed to model:"
          />
          <PromptInstructionsPreview
            compiledInstructions={compiledUserInstructions}
            missingVariables={missingUserInstructionsVariables}
            label="User instructions that will be passed to model:"
          />
        </div>
      </BaseModal>
      <div className="flex items-center justify-start mb-2">
        {(() => {
          const meta = getBatchLabel(currentGuaranteedVariable);
          return (
            <div
              className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs ${meta.className}`}
              aria-label={`Current batch: ${meta.label}${isBatchUnsaved ? ", unsaved changes" : ""}`}
              title={isBatchUnsaved ? "Unsaved batch change" : "Current batch"}
            >
              <span className="font-medium">Batch: {meta.label}</span>
              {isBatchUnsaved && <span className="italic text-[0.7rem]">(Unsaved)</span>}
            </div>
          );
        })()}
      </div>
      <TextArea
        value={stripGuaranteedLine(systemInstructions)}
        onChange={(e) => {
          const cleaned = stripGuaranteedLine(e.target.value);
          const merged = withGuaranteedLine(cleaned, currentGuaranteedVariable);
          setSystemInstructions(merged);
        }}
        onKeyDownCapture={(e) => {
          // Handle spacebar in capture phase - prevent default to stop drag-and-drop library
          if (e.target instanceof HTMLTextAreaElement && (e.key === ' ' || e.keyCode === 32)) {
            e.preventDefault();
            e.stopPropagation();
            
            // Manually insert space and directly update state
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentValue = textarea.value;
            const newValue = currentValue.substring(0, start) + ' ' + currentValue.substring(end);
            
            // Update textarea value
            textarea.value = newValue;
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            
            // Directly call onChange handler to update React state
            const cleaned = stripGuaranteedLine(newValue);
            const merged = withGuaranteedLine(cleaned, currentGuaranteedVariable);
            setSystemInstructions(merged);
          }
        }}
        onKeyDown={(e) => {
          // Handle spacebar - prevent default to stop drag-and-drop library
          if (e.target instanceof HTMLTextAreaElement && (e.key === ' ' || e.keyCode === 32)) {
            e.preventDefault();
            e.stopPropagation();
            
            // Manually insert space and directly update state
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentValue = textarea.value;
            const newValue = currentValue.substring(0, start) + ' ' + currentValue.substring(end);
            
            // Update textarea value
            textarea.value = newValue;
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            
            // Directly call onChange handler to update React state
            const cleaned = stripGuaranteedLine(newValue);
            const merged = withGuaranteedLine(cleaned, currentGuaranteedVariable);
            setSystemInstructions(merged);
          }
        }}
        ref={setSystemInstructionsTextareaRef}
        id="system_instructions"
        label="Enter the system instructions here:"
      />
      <TextArea
        value={userInstructions}
        onChange={(e) => setUserInstructions(e.target.value)}
        onKeyDownCapture={(e) => {
          // Handle spacebar in capture phase to intercept before drag-and-drop library
          if (e.target instanceof HTMLTextAreaElement && (e.key === ' ' || e.keyCode === 32)) {
            // Stop propagation to prevent drag-and-drop library from handling it
            e.stopPropagation();
            // Don't prevent default - let the space character be inserted naturally
          }
        }}
        onKeyDown={(e) => {
          // Handle spacebar - manually insert if default was prevented
          if (e.target instanceof HTMLTextAreaElement && (e.key === ' ' || e.keyCode === 32)) {
            e.stopPropagation();
            
            // If default was prevented, manually insert space
            if (e.defaultPrevented) {
              const textarea = e.target;
              insertSpaceAtCursor(textarea);
            }
          }
        }}
        ref={setUserInstructionsTextareaRef}
        id="user_instructions"
        label="Enter your user instructions here:"
      />
      <button
        className="btn-secondary w-fit"
        onClick={() => setShowCompiledPrompt(true)}
      >
        Show Compiled Instructions
      </button>
      <div className="flex flex-col gap-2">
        <label>Model Settings:</label>
        <div className="flex w-full gap-2">
          <Dropdown
            className="flex-shrink-0 flex-grow-0"
            options={MODEL_PROVIDER_DROPDOWN_OPTIONS}
            selectedOption={
              MODEL_PROVIDER_DROPDOWN_OPTIONS.find(
                (option) => option.id === modelProvider,
              ) || null
            }
            setSelectedOption={(option) => {
              option.id === "default"
                ? removeModelProvider()
                : setModelProvider(option.id);
            }}
            placeholderText="Override Model Provider"
          />
          <Dropdown
            className="flex-shrink-0 flex-grow-0"
            options={modelsForProvider}
            selectedOption={
              modelName
                ? { id: modelName || "select", label: modelName || "select" }
                : null
            }
            setSelectedOption={(option) => setModelName(option.id)}
            placeholderText={
              modelProvider ? "Override Model" : "Select Provider"
            }
            disabled={!modelProvider}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label>Output:</label>
        {isRunningModel ? (
          <p>Running...</p>
        ) : output ? (
          <>
            <Markdown remarkPlugins={[remarkGfm]}>{output.response}</Markdown>
            {output.is_cached && (
              <p className="subtitle">
                ⚠️ This is a previously generated response cached in the
                database. The LLM was not re-run for this request.
              </p>
            )}
          </>
        ) : (
          <>
            <button
              disabled={!isReady}
              className="btn-primary w-fit"
              onClick={() => onClickRunModel()}
            >
              Run Model
            </button>
            {!isReady && (
              <p className="error mt-2">
                ⛔️ Finish entering or building your input prompts to generate
                an output.
              </p>
            )}
            {errorRunningModel && (
              <p className="error mt-2">
                ⛔️ There was an error running the model:{" "}
                {errorRunningModel.message}.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
};

const EMPTY_PLAY_PLAYSTEPS: PlayStep[] = [{}];
const EMPTY_PLAY_VARIABLES: Dictionary<string> = {};

const PLACEHOLDER_INDEX = 9007199251;

// Play Output Types:
// Plays that output variables run first and can only leverage External data. (Not Company or Custom data.)
// Plays that output "final" output can leverage all data, including the output of plays that output variables.
export const PlayEditor = ({
  playOutputType,
}: {
  playOutputType: PlayOutputType;
}) => {
  // Networking
  const {
    data: plays = [],
    isFetching: isLoadingPlays,
    error: errorPlays,
  } = useBackendQuery<Play[]>(`plays/?output_type=${playOutputType}`);

  const client = useQueryClient();
  const {
    mutate: deletePlay,
    error: errorUpdating,
    isPending,
  } = useBackendMutation<Partial<Play>, Play>(
    (data) => `plays/${data.id}/`,
    "DELETE",
    {
      onSuccess: () => {
        setLoadedPlay(undefined);
        client.invalidateQueries({ queryKey: ["plays/", "output_type=final"] });
      },
    },
  );

  const onDelete = async (playId?: number) => {
    if (!playId) return;
    const shouldDelete = window.confirm(
      "Are you sure you want to delete this play?",
    );
    if (shouldDelete) deletePlay({ id: playId });
  };

  const toggleVisible: ChangeEventHandler<HTMLInputElement> = (e) => {
    setVisible(e.target.checked);
  };

  const {
    data: companyAndUserVariables,
    error: errorVariables,
    isFetching: isLoadingVariables,
  } = useCompanyAndProfileVariables();
  
  // Check if user has set up onboarding variables
  const { data: onboardingVariables } = useOnboardingVariables();
  const hasOnboardingSetup = onboardingVariables && (
    onboardingVariables.company_name || 
    onboardingVariables.industry || 
    onboardingVariables.role
  );

  // Editor State
  const [loadedPlay, setLoadedPlay] = useState<Play | undefined>(undefined);
  const [playSteps, setPlaySteps] = useState<PlayStep[]>(EMPTY_PLAY_PLAYSTEPS);
  const [variables, setVariables] = useState<Dictionary<string>>(
    loadedPlay?.variables || {},
  );

  const [visible, setVisible] = useState<boolean>(Boolean(loadedPlay?.visible));
  const [numOutputs, setNumOutputs] = useState<number>(3);
  const [savedNumOutputs, setSavedNumOutputs] = useState<number>(3);
  const clampOutputCount = useCallback(
    (value: number) =>
      Math.min(3, Math.max(1, Math.round(Number.isFinite(value) ? value : 3))),
    [],
  );

  const {
    data: fetchedPreference,
    isFetching: isLoadingPreference,
  } = useUserPlayPreference(loadedPlay?.id);
  const preferenceData = Array.isArray(fetchedPreference)
    ? fetchedPreference[0]
    : fetchedPreference;

  const {
    mutate: mutateUserPreference,
    isPending: isSavingPreference,
  } = useUpdateUserPlayPreference({
    onSuccess: (response) => {
      const value = clampOutputCount(response.num_outputs);
      setSavedNumOutputs(value);
      setNumOutputs(value);
    },
  });

  useEffect(() => {
    if (!loadedPlay?.id) {
      setNumOutputs(3);
      setSavedNumOutputs(3);
      return;
    }

    if (isLoadingPreference) {
      return;
    }

    if (preferenceData && preferenceData.play && preferenceData.play !== loadedPlay.id) {
      return;
    }

    const value = clampOutputCount(preferenceData?.num_outputs ?? 3);
    setNumOutputs(value);
    setSavedNumOutputs(value);
  }, [
    clampOutputCount,
    isLoadingPreference,
    loadedPlay?.id,
    preferenceData?.num_outputs,
    preferenceData?.play,
  ]);

  const handleNumOutputsChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const next = Number(event.target.value);
    setNumOutputs(Number.isNaN(next) ? 1 : next);
  };

  const handleNumOutputsBlur = () => {
    setNumOutputs((current) => clampOutputCount(current));
  };

  const persistNumOutputs = useCallback(
    (playId?: number) => {
      const targetPlayId = playId ?? loadedPlay?.id;
      if (!targetPlayId) {
        return;
      }
      const value = clampOutputCount(numOutputs);
      mutateUserPreference({ play: targetPlayId, num_outputs: value });
    },
    [clampOutputCount, loadedPlay?.id, mutateUserPreference, numOutputs],
  );
  
  // Guaranteed variable state (replaces manual batch selection)
  const [selectedGuaranteedVariable, setSelectedGuaranteedVariable] = useState<string | null>(null);

  // External Data State
  const [linkedInProfile, setLinkedInProfile] =
    useState<LinkedInProfile | null>();
  const [hubSpotVariables, setHubspotVariables] = useState<Record<
    string,
    string
  > | null>();
  const [linkedInVariables, setLinkedInVariables] = useState<Record<
    string,
    string
  >>({});
  const allLinkedInVariables = {
    ...linkedInProfile?.profile_data,
    ...linkedInVariables
  };

  // enrichmentAliases defined after companyVariables/personaVariables

  // UI State
  const [isLoadPlayOpen, setIsLoadPlayOpen] = useState<boolean>(false);
  const [isSavePlayOpenWithMode, setIsSavePlayOpenWithMode] = useState<
    false | "create" | "update"
  >(false);
  const [isEditPlayNameOpenForIndex, setIsEditPlayNameOpenForIndex] = useState<
    false | string
  >(false);
  const [playNameInput, setPlayNameInput] = useState<string>("");
  const [companyVariablesIndex, setCompanyVariablesIndex] = useState<number | null>(null);

  // Business Logic

  const numCompanyVariables = Object.keys(companyAndUserVariables)
    .map((key) => companyAndUserVariables[key].length)
    .reduce((a, b) => Math.max(a, b), 0);
  const companyVariables =
    companyVariablesIndex !== null
      ? getSet(companyAndUserVariables, companyVariablesIndex)
      : undefined;

  const companyDataDropdownOptions = range(numCompanyVariables).map((i) => ({
    id: i,
    label: `Value Set ${i + 1}`,
  }));

  const personaData = Object.values(linkedInProfile?.persona || {})?.[0] || {};
  const personaVariables =
    companyVariablesIndex !== null
      ? getSet(personaData, companyVariablesIndex)
      : undefined;

  // Aliases so unprefixed variables commonly used in plays work with enrichment data
  const enrichmentAliases: Dictionary<string> = (() => {
    const out: Dictionary<string> = {};

    // 0) Generic normalization: add snake_case aliases for every key
    const toSnake = (k: string) => k
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    for (const src of [allLinkedInVariables as any, companyVariables as any, hubSpotVariables as any]) {
      if (!src) continue;
      for (const [key, value] of Object.entries(src)) {
        const snake = toSnake(key);
        if (!(snake in out)) out[snake] = String(value ?? "");
      }
    }

    for (const src of [allLinkedInVariables as any, companyVariables as any, hubSpotVariables as any]) {
      if (!src) continue;
      for (const [key, value] of Object.entries(src)) {
        if (key.startsWith("company_")) {
          const unprefixed = key.slice("company_".length);
          if (!(unprefixed in out)) out[unprefixed] = String(value ?? "");
        }
      }
    }

    // Specific convenience aliases
    const get = (k: string): string | undefined => {
      const fromLinkedInVars = (allLinkedInVariables as any)?.[k];
      const fromCompanyVars = (companyVariables as any)?.[k];
      const fromHubspotVars = (hubSpotVariables as any)?.[k];
      return (fromLinkedInVars ?? fromCompanyVars ?? fromHubspotVars) as string | undefined;
    };
    const desc =
      get("company_description") ||
      get("linkedin_current_company_description") ||
      get("linkedin_company_description") ||
      get("linkedin_profile_summary") ||
      get("linkedin_summary");
    if (desc) out.description = String(desc);
    const site =
      get("company_website") ||
      get("website") ||
      get("website_alias") ||
      get("site") ||
      (hubSpotVariables as any)?.hubspot_company_website; // fallback from HubSpot
    if (site) out.website = String(site);

    // Synonyms: website_alias/site -> website, sourceid -> source_id
    const sourceId = get("sourceid") || (out as any)["sourceid"];
    if (sourceId && !out["source_id"]) out["source_id"] = String(sourceId);

    // Pass-through: top_previous_companies if present in either source
    const prevCos = get("top_previous_companies") || (out as any)["top_previous_companies"];
    if (prevCos) out["top_previous_companies"] = String(prevCos);

    // Simplified employees_count_change alias
    const change = get("company_employees_count_change_yearly_percentage") || get("employees_count_change_yearly_percentage");
    if (change) out.employees_count_change = String(change);
    if (!("employees_count_change" in out)) out.employees_count_change = "";

    // Base salary from LinkedIn projected fields
    const liBase = (allLinkedInVariables as any)?.projected_base_salary_median
      ?? (allLinkedInVariables as any)?.projected_total_salary_median
      ?? (allLinkedInVariables as any)?.projected_base_salary_p50
      ?? (allLinkedInVariables as any)?.projected_total_salary_p50;
    if (liBase !== undefined && liBase !== null) {
      out["base_salary"] = String(liBase);
    }

    // average_visit_duration_seconds from enrichment if available
    const avgVisit = get("company_average_visit_duration_seconds") || get("average_visit_duration_seconds") || (out as any)["company_average_visit_duration_seconds"];
    if (avgVisit !== undefined && avgVisit !== null) {
      out["average_visit_duration_seconds"] = String(avgVisit);
    }

    // Guarantee presence of active_job_postings_count_change for validation
    if (!("active_job_postings_count_change" in out)) out.active_job_postings_count_change = "";
    if (!("website" in out)) out.website = "";

    return out;
  })();

  useEffect(() => {
    if (isEditPlayNameOpenForIndex) {
      setPlayNameInput(
        playSteps[Number(isEditPlayNameOpenForIndex)]?.name || "",
      );
    }
  }, [isEditPlayNameOpenForIndex]);

  // System variables that are always available
  const systemVariables: Dictionary<string> = {
    today_date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
  };

  // Org Chart / Account Intel variables (placeholder for testing)
  const orgChartVariables: Dictionary<string> = {
    account_intel: "Sample account intel for testing. This will be replaced with actual org chart data when the play runs in the extension.",
    org_chart_matched: "true",
    org_chart_match_type: "website",
    org_chart_confidence: "100",
    org_chart_company_name: "Sample Company"
  };

  const {
    promptResponses,
    runLLMForStep,
    availableVariablesForStep,
    isRunningAllSteps,
    isStepReadyToRun,
    isReadyToRunAllSteps,
    runAllSteps,
  } = useRunLLM(
    playSteps,
    merge(
      {},
      systemVariables,
      orgChartVariables,
      hubSpotVariables,
      allLinkedInVariables,
      enrichmentAliases,
      companyVariables,
      personaVariables,
      variables,
    ),
    playOutputType,
  );

  const resetEditorState = () => {
    setPlaySteps(loadedPlay?.play_steps || EMPTY_PLAY_PLAYSTEPS);
    setVariables(loadedPlay?.variables || EMPTY_PLAY_VARIABLES);
    setNumOutputs(3);
    setSavedNumOutputs(3);
  };

  // Detect existing guaranteed variables in play content
  const detectGuaranteedVariableInPlay = (play: Play | undefined): string | null => {
    if (!play) return null;
    
    // Look only in system instructions for the full "(Ignore this: Guaranteed variable: {...})" pattern
    for (const step of play.play_steps) {
      const systemTemplate = step.system_instructions_template || '';
      
      // Check for each guaranteed variable pattern
      const guaranteedVariables = [
        'linkedin_profile_guaranteed',
        'company_enrichment_guaranteed',
        'hubspot_guaranteed', 
        'linkedin_posts_guaranteed',
        'linkedin_jobs_guaranteed'
      ];

      for (const variable of guaranteedVariables) {
        if (systemTemplate.includes(`(Ignore this: Guaranteed variable: {${variable}})`)) {
          return variable;
        }
      }
    }
    
    return null; // No guaranteed variable found
  };

  // Detect guaranteed variable from the current editor state (playSteps)
  const detectGuaranteedVariableInSteps = (steps: PlayStep[]): string | null => {
    for (const step of steps) {
      const systemTemplate = step.system_instructions_template || '';
      const guaranteedVariables = [
        'linkedin_profile_guaranteed',
        'company_enrichment_guaranteed',
        'hubspot_guaranteed',
        'linkedin_posts_guaranteed',
        'linkedin_jobs_guaranteed',
      ];
      for (const variable of guaranteedVariables) {
        if (systemTemplate.includes(`(Ignore this: Guaranteed variable: {${variable}})`)) {
          return variable;
        }
      }
    }
    return null;
  };

  // Update play steps with guaranteed variable
  const updatePlayStepsWithGuaranteedVariable = (newVariable: string | null) => {
    setPlaySteps(prevSteps => {
      return prevSteps.map(step => {
        const systemTemplate = step.system_instructions_template || '';
        
        // Remove the entire "(Ignore this: Guaranteed variable: {...})" line if it exists
        const cleanedSystem = systemTemplate.replace(/\(Ignore this: Guaranteed variable: \{[^}]+\}\)/g, '').trim();
        
        // Add new guaranteed variable line if selected
        const newSystemTemplate = newVariable 
          ? `${cleanedSystem}\n\n(Ignore this: Guaranteed variable: {${newVariable}})` 
          : cleanedSystem;
        
        return {
          ...step,
          system_instructions_template: newSystemTemplate.trim(),
          // Don't modify user_instructions_template - guaranteed variables are only in system
        };
      });
    });
  };

  // Resets editor state if a different play is loaded (or if the play is cleared)
  useEffect(() => {
    resetEditorState();
    setVisible(loadedPlay ? Boolean(loadedPlay?.visible) : true);
    
    // Detect guaranteed variable in loaded play
    if (loadedPlay) {
      const detectedVariable = detectGuaranteedVariableInPlay(loadedPlay);
      setSelectedGuaranteedVariable(detectedVariable);
    } else {
      setSelectedGuaranteedVariable(null);
    }
  }, [loadedPlay?.id]);

  const canClearPlay = Boolean(
    playSteps.some((step) => Object.values(step).some((value) => value)) ||
      Object.values(variables).some((value) => value) ||
      Object.keys(variables).length,
  );

  const clearPlay = () => {
    setLoadedPlay(undefined);
    setSelectedGuaranteedVariable(null);
    resetEditorState();
  };

  const hasMultiplePrompts = playSteps.length > 1;

  const insertPlayStep = (atIndex: number) => {
    const newPrompts = [...playSteps];
    newPrompts.splice(atIndex, 0, {});
    setPlaySteps(newPrompts);
  };

  const removePlayStep = (atIndex: number) => {
    const newPrompts = [...playSteps];
    newPrompts.splice(atIndex, 1);
    setPlaySteps(newPrompts);
  };

  const updatePlayStep = (atIndex: number, playStep: PlayStep) => {
    if (isEqual(playStep, playSteps[atIndex])) return;

    const newPrompts = [...playSteps];
    newPrompts[atIndex] = playStep;
    setPlaySteps(newPrompts);
  };

  const reorderPlaySteps = (fromIndex: number, toIndex: number) => {
    const newPrompts = [...playSteps];

    // Update all references to the moved prompt in any instructions
    const indexChanges: { [fromIndex: number]: number } = {
      [fromIndex]: PLACEHOLDER_INDEX,
      [PLACEHOLDER_INDEX]: toIndex,
    };
    if (fromIndex < toIndex) {
      range(fromIndex + 1, toIndex + 1).forEach((i) => {
        indexChanges[i] = i - 1;
      });
    } else {
      range(toIndex, fromIndex).forEach((i) => {
        indexChanges[i] = i + 1;
      });
    }
    playSteps.forEach((playStep, index) => {
      let { user_instructions_template, system_instructions_template } =
        playStep;

      let currFromIndex = PLACEHOLDER_INDEX;
      while (true) {
        const currToIndex = currFromIndex;
        const currFromIndexStr =
          findKey(indexChanges, (v) => v === currToIndex) ?? ""; // Should never be undefined
        currFromIndex = parseInt(currFromIndexStr);
        user_instructions_template = user_instructions_template?.replace(
          `{prompt_${currFromIndex + 1}}`,
          `{prompt_${currToIndex + 1}}`,
        );
        system_instructions_template = system_instructions_template?.replace(
          `{prompt_${currFromIndex + 1}}`,
          `{prompt_${currToIndex + 1}}`,
        );
        if (currFromIndex === PLACEHOLDER_INDEX) break; // We've reached the original currFromIndex index, so we're done
      }

      newPrompts[index] = {
        ...playStep,
        user_instructions_template,
        system_instructions_template,
      };
    });

    // Reorder the prompts
    const [removed] = newPrompts.splice(fromIndex, 1);
    newPrompts.splice(toIndex, 0, removed);
    setPlaySteps(newPrompts);
  };

  const onDragEnd: OnDragEndResponder = (result) => {
    // dropped outside the list
    if (!result.destination) return;
    reorderPlaySteps(result.source.index, result.destination.index);
  };

  const hasUnsavedPreference =
    playOutputType === PlayOutputType.FINAL && numOutputs !== savedNumOutputs;

  const hasUnsavedChanges =
    !isEqual(playSteps, loadedPlay?.play_steps) ||
    !isEqual(variables, loadedPlay?.variables) ||
    Boolean(loadedPlay?.visible) !== visible ||
    selectedGuaranteedVariable !== (loadedPlay ? detectGuaranteedVariableInPlay(loadedPlay) : null) ||
    hasUnsavedPreference;

  const playToSave = {
    ...loadedPlay,
    visible,
    output_type: playOutputType,
    variables,
    play_steps: playSteps,
  };

  const scrollToPrompt = (index: number) => {
    const promptElement = document.getElementById(`prompt_${index}`);
    if (promptElement) {
      promptElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    }
  };

  // Batch control UI component
  const BatchSelector = () => {
    const currentVariable = detectGuaranteedVariableInSteps(playSteps);
    const originalVariable = loadedPlay ? detectGuaranteedVariableInPlay(loadedPlay) : null;
    
    const batchOptions = [
      { id: 1, label: 'LinkedIn Profile', variable: 'linkedin_profile_guaranteed', color: 'blue' },
      { id: 2, label: 'Company Enrichment', variable: 'company_enrichment_guaranteed', color: 'green' },
      { id: 3, label: 'HubSpot', variable: 'hubspot_guaranteed', color: 'purple' },
      { id: 4, label: 'LinkedIn Posts', variable: 'linkedin_posts_guaranteed', color: 'orange' },
      { id: 5, label: 'LinkedIn Jobs', variable: 'linkedin_jobs_guaranteed', color: 'pink' }
    ];

    const toggleBatch = (batchId: number) => {
      const batch = batchOptions.find(b => b.id === batchId);
      if (!batch) return;

      const newVariable = selectedGuaranteedVariable === batch.variable ? null : batch.variable;
      setSelectedGuaranteedVariable(newVariable);
      updatePlayStepsWithGuaranteedVariable(newVariable);
    };

    return (
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">Required Data Batch:</label>
        <div className="flex flex-wrap gap-2">
            {batchOptions.map(batch => (
            <button
              key={batch.id}
              type="button"
              onClick={() => toggleBatch(batch.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                currentVariable === batch.variable
                  ? batch.id === 1 ? 'bg-blue-600 text-white'
                  : batch.id === 2 ? 'bg-green-600 text-white'
                  : batch.id === 3 ? 'bg-purple-600 text-white'
                  : batch.id === 4 ? 'bg-orange-600 text-white'
                  : 'bg-pink-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {currentVariable === batch.variable ? '✓ ' : ''}
              Batch {batch.id}: {batch.label}
            </button>
          ))}
        </div>
        {!currentVariable && (
          <p className="text-xs text-gray-500 italic">
            No batch selected - play will run when all required data is available
          </p>
        )}
        {currentVariable && (
          <p className="text-xs text-gray-600">
            Selected: {currentVariable}
          </p>
        )}
          {currentVariable !== originalVariable && (
            <p className="text-xs text-amber-600 italic">
              Unsaved batch change
            </p>
          )}
      </div>
    );
  };

  return (
    <>
      <SearchSelectModal
        open={isLoadPlayOpen}
        onClose={() => setIsLoadPlayOpen(false)}
        options={plays
          .map((play) => ({
            id: play.id,
            name: [play.category, play.name].filter(Boolean).join(": "),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        onSelect={(selectedOption) => {
          const selectedPlay = plays.find(
            (play) => play.id === selectedOption.id,
          );
          if (selectedPlay?.id === loadedPlay?.id) {
            resetEditorState();
          } else {
            setLoadedPlay(selectedPlay);
          }
          setIsLoadPlayOpen(false);
        }}
        isLoading={isLoadingPlays}
        errorMessage={errorPlays?.message}
      />
      <SavePlayModal
        open={Boolean(isSavePlayOpenWithMode)}
        play={playToSave}
        mode={isSavePlayOpenWithMode || "create"}
        onClose={() => setIsSavePlayOpenWithMode(false)}
        onSave={(play) => {
          if (hasUnsavedPreference) {
            persistNumOutputs(play.id);
          }
          setLoadedPlay(play);
          setIsSavePlayOpenWithMode(false);
        }}
      />
      <BaseModal
        show={Boolean(isEditPlayNameOpenForIndex)}
        onClose={() => setIsEditPlayNameOpenForIndex(false)}
      >
        <div className="px-4 py-5 sm:p-6 w-full flex flex-col gap-2">
          <label htmlFor="play_name">Name prompt</label>
          <input
            value={playNameInput}
            onChange={(e) => setPlayNameInput(e.target.value)}
            type="text"
            name="play_name"
            id="play_name"
            autoComplete="off"
            className="block w-full primary-input"
          />
          <div className="flex mt-1 gap-2 items-center">
            <button
              disabled={playNameInput === ""}
              type="submit"
              className="btn-primary flex-grow-0 flex-shrink-0 w-fit"
              onClick={() => {
                updatePlayStep(Number(isEditPlayNameOpenForIndex) as number, {
                  ...playSteps[Number(isEditPlayNameOpenForIndex) as number],
                  name: playNameInput,
                });
                setIsEditPlayNameOpenForIndex(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      </BaseModal>
      <div className="w-full h-full flex divide-x overflow-hidden">
        <div className="outer-container w-1/2">
          <div className="inner-container">
                          <div className="flex flex-col gap-4">

                
                <div className="flex flex-col gap-4">
                  {/* Load and clear */}
                  <div className="flex flex-wrap gap-4">
                  <button
                    className="btn-secondary w-fit"
                    onClick={() => setIsLoadPlayOpen(true)}
                  >
                    Load{" "}
                    {playOutputType === PlayOutputType.FINAL
                      ? "Play"
                      : "Research"}
                  </button>
                  <button
                    disabled={!canClearPlay}
                    className="btn-secondary"
                    onClick={() => setIsSavePlayOpenWithMode("create")}
                  >
                    Save as New{" "}
                    {playOutputType === PlayOutputType.FINAL
                      ? "Play"
                      : "Research"}
                  </button>
                  <button
                    disabled={!canClearPlay}
                    className="btn-secondary w-fit"
                    onClick={() => clearPlay()}
                  >
                    Clear{" "}
                    {playOutputType === PlayOutputType.FINAL
                      ? "Play"
                      : "Research"}
                  </button>
                </div>
                {/* Save and delete */}
                {loadedPlay && playOutputType === PlayOutputType.VARIABLE && (
                  <>
                    <p className="subtitle">
                      Currently editing Research: <strong>{loadedPlay.name}</strong>
                    </p>
                    <BatchSelector />
                  </>
                )}
                <div className="flex flex-wrap gap-4">
                  {playOutputType === PlayOutputType.FINAL && (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-slate-700" htmlFor="output_count">
                        Output variations (1-3)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="output_count"
                          type="number"
                          min={1}
                          max={3}
                          value={numOutputs}
                          onChange={handleNumOutputsChange}
                          onBlur={handleNumOutputsBlur}
                          className="primary-input w-20 text-center"
                          disabled={isLoadingPreference || isSavingPreference || !loadedPlay?.id}
                        />
                        {hasUnsavedPreference && (
                          <span className="text-xs italic text-amber-600">Unsaved</span>
                        )}
                        <button
                          className="btn-secondary"
                          disabled={
                            !hasUnsavedPreference ||
                            isSavingPreference ||
                            !loadedPlay?.id ||
                            numOutputs < 1 ||
                            numOutputs > 3
                          }
                          onClick={() => persistNumOutputs()}
                        >
                          {isSavingPreference ? "Saving..." : "Save Output Count"}
                        </button>
                      </div>
                    </div>
                  )}
                  {loadedPlay?.id && (
                    <>
                      <button
                        disabled={!hasUnsavedChanges}
                        className="btn-secondary bg-green-100 enabled:hover:bg-green-200"
                        onClick={() => setIsSavePlayOpenWithMode("update")}
                      >
                        Save Changes
                      </button>
                      <label
                        htmlFor="visible"
                        className="btn-primary flex items-center cursor-pointer"
                      >
                        <input
                          checked={visible}
                          type="checkbox"
                          id="visible"
                          className="h-4 w-4 mr-2 rounded-full"
                          onChange={toggleVisible}
                        />
                        Visible
                      </label>
                      <button
                        className="btn-secondary bg-red-400 text-white hover:bg-red-500"
                        onClick={() => onDelete(loadedPlay?.id)}
                      >
                        Delete Play
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <h2>Final Output</h2>
              <button
                disabled={!isReadyToRunAllSteps}
                className="btn-primary"
                onClick={() => runAllSteps()}
              >
                Run All Prompts
              </button>
              {isRunningAllSteps ? (
                <p>Running...</p>
              ) : promptResponses[playSteps.length - 1] ? (
                <Markdown remarkPlugins={[remarkGfm]}>
                  {promptResponses[playSteps.length - 1]?.response}
                </Markdown>
              ) : isReadyToRunAllSteps ? (
                <p className="subtitle">
                  Run all prompts to generate final output.
                </p>
              ) : (
                <p className="error">
                  ⛔️ Fix errors and then run all prompts to generate final
                  output.
                </p>
              )}
              <h3 className="mt-2">Sequence Overview</h3>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="droppable">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="flex flex-col gap-2"
                    >
                      {playSteps?.map((playStep, index) => (
                        <Draggable
                          key={index}
                          draggableId={index.toString()}
                          index={index}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="flex gap-2 items-center cursor-move"
                              onClick={() => scrollToPrompt(index)}
                            >
                              <DotsSix
                                size={20}
                                className="flex-shrink-0 flex-grow-0"
                              />
                              <p
                                title={promptResponses[index]?.response}
                                className="truncate basis-0 flex-shrink flex-grow"
                              >
                                {playSteps[index]?.name && (
                                  <span className="font-bold">
                                    {playSteps[index]?.name}:{" "}
                                  </span>
                                )}
                                <span
                                  className={
                                    promptResponses[index]?.response
                                      ? ""
                                      : isStepReadyToRun(index)
                                        ? "subtitle"
                                        : "error"
                                  }
                                >
                                  {promptResponses[index]?.response ? (
                                    <>
                                      <code>
                                        &#123;prompt_{index + 1}&#125;
                                      </code>{" "}
                                      {promptResponses[index]?.response}
                                    </>
                                  ) : isRunningAllSteps ? (
                                    "Running..."
                                  ) : isStepReadyToRun(index) ? (
                                    "Ready to Run"
                                  ) : (
                                    "⛔️ Not Ready to Run"
                                  )}
                                </span>
                              </p>
                              {hasMultiplePrompts && (
                                <IconButton
                                  onClick={() => removePlayStep(index)}
                                  size={20}
                                  className="flex-shrink-0 flex-grow-0"
                                  Icon={Trash}
                                />
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <p className="subtitle">
                References to prompts in instructions will automatically be
                updated if prompts are re-ordered.
              </p>
              <button
                className="btn-secondary w-fit mt-2"
                onClick={() => insertPlayStep(playSteps.length)}
              >
                Add Prompt to Sequence
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <h2>Variables</h2>
              {!numCompanyVariables && !isLoadingVariables ? (
                <p className="subtitle">
                  Add Company Level Data in the Company Setup section to
                  leverage a shared data set across all plays.
                </p>
              ) : errorVariables ? (
                <p className="error">
                  ⛔️ Error loading company data. Please contact support.
                </p>
              ) : (
                <Dropdown
                  options={companyDataDropdownOptions}
                  setSelectedOption={(option) =>
                    setCompanyVariablesIndex(option.id)
                  }
                  selectedOption={
                    companyVariablesIndex !== null && companyVariablesIndex < companyDataDropdownOptions.length
                      ? companyDataDropdownOptions[companyVariablesIndex]
                      : null
                  }
                  placeholderText="Select company variables..."
                  label="Choose which Company & Persona Data Set to use in the play:"
                  title={JSON.stringify(companyVariables)}
                />
              )}
              <GetLinkedInData
                onLoadData={setLinkedInProfile}
                setHubspotVariables={setHubspotVariables}
                setLinkedInVariables={setLinkedInVariables}
                hidePersonaData={playOutputType === PlayOutputType.VARIABLE}
              />
              
              {hubSpotVariables && (
                <DictionaryTable
                  data={hubSpotVariables}
                  label="HubSpot Data:"
                />
              )}
              
              <DictionaryTable
                data={{
                  ...systemVariables,
                  ...orgChartVariables,
                  ...(allLinkedInVariables || {}),
                  ...(hubSpotVariables || {}),
                }}
                label="Research Variables (System + Org Chart + LinkedIn + HubSpot):"
              />
              
              {playOutputType === PlayOutputType.FINAL && (
                <>
                  {companyVariables && (
                    <DictionaryTable
                      data={companyVariables}
                      label="Company Data:"
                    />
                  )}
                  <DictionaryTable
                    isEditable
                    data={variables}
                    onChange={setVariables}
                    label="Add and save additional data specific to this play:"
                  />
                </>
              )}
              <p className="subtitle card">
                Use the variables in your system or user instructions by placing
                it in curly braces, like this:{" "}
                <code>
                  &#123;
                  {Object.keys(variables).length > 0
                    ? Object.keys(variables)[0]
                    : "topic"}
                  &#125;
                </code>
              </p>
            </div>
          </div>
        </div>
        <div className="outer-container w-1/2">
          <div className="inner-container">
            {playSteps.map((playStep, index) => {
              const allVariables = availableVariablesForStep(index);
              const isLastPrompt = index === playSteps.length - 1;
              const hasOutput =
                index in promptResponses && promptResponses[index];

              return (
                <Fragment key={index}>
                  <div className="flex flex-col gap-4" id={`prompt_${index}`}>
                    {hasMultiplePrompts && (
                      <div className="flex items-center gap-2">
                        <h2>{playStep.name || `Prompt ${index + 1}`}</h2>
                        <IconButton
                          onClick={() =>
                            setIsEditPlayNameOpenForIndex(String(index))
                          }
                          size={20}
                          className="flex-shrink-0 flex-grow-0"
                          Icon={Pencil}
                        />
                      </div>
                    )}
                    <LLMPrompt
                      runAllSteps={runAllSteps}
                      isReadyToRunAllSteps={isReadyToRunAllSteps}
                      playStep={playStep}
                      setPlayStep={(newPlayStep) => {
                        updatePlayStep(index, newPlayStep);
                      }}
                      variables={allVariables}
                      output={promptResponses[index]}
                      runModel={() => runLLMForStep(index)}
                      currentGuaranteedVariable={detectGuaranteedVariableInSteps(playSteps)}
                      isBatchUnsaved={
                        (detectGuaranteedVariableInSteps(playSteps) || null) !==
                        (loadedPlay ? detectGuaranteedVariableInPlay(loadedPlay) : null)
                      }
                    />
                    {hasOutput && !isLastPrompt && (
                      <p className="subtitle card">
                        Use the output of this prompt in subsequent prompts by
                        referencing <code>&#123;prompt_{index + 1}&#125;</code>{" "}
                        in the system or user prompt templates.
                      </p>
                    )}
                  </div>
                  {!isLastPrompt && (
                    <hr className="h-px bg-neutral-200 border-0" />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

// TODO: Pull in Persona data based on LI into the PlayEditor. Show which was choosen and the variables.
