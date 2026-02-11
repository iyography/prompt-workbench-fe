"use client";

import { DictionaryTable } from "@/components/common/DictionaryTable";
import { Dropdown } from "@/components/common/Dropdown";
import { BaseModal } from "@/components/modals/BaseModal";
import { GetLinkedInData } from "@/components/smart/GetLinkedInData";
import { BatchViewer } from "@/components/batches/BatchViewer";
import { useBackendMutation, useBackendQuery } from "@/hooks/networking";
import { useCompanyAndProfileVariables } from "@/hooks/useCompanyAndProfileVariables";
import { useRunLLM } from "@/hooks/useRunLLM";
import { LinkedInProfile } from "@/models/linkedin-profile";
import {
  Play,
  PlayOutputType,
  PlayRanServerSide,
  RunFinalPlayResponseType,
} from "@/models/play";
import {isValidSmartVariableValue, requiredKeys} from "@/utils/llm";
import { Dictionary, isEmpty, merge } from "lodash";
import { Fragment, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MissingVariablesList = ({ variables }: { variables: string[] }) =>
  variables.map((variable) => (
    <Fragment key={variable}>
      <code key={variable}>{variable}</code>
      <span className="last:hidden">, </span>
    </Fragment>
  ));

export default function Execute() {
  // -- Networking

  const {
    data: finalOutputPlays = [],
    isFetching: isLoadingPlays,
    error: errorPlays,
  } = useBackendQuery<Play[]>(`plays/?output_type=${PlayOutputType.FINAL}`);

  const {
    data: companyAndUserVariables,
    error: errorVariables,
    isFetching: isLoadingVariables,
  } = useCompanyAndProfileVariables();

  // -- State
  const [selectedPlay, setSelectedPlay] = useState<Play | undefined>(undefined);
  const [isVariableSetterOpen, setIsVariableSetterOpen] =
    useState<boolean>(false);
  const [isSmartVariableModalOpen, setIsSmartVariableModalOpen] =
    useState<boolean>(false);
  const [linkedInProfile, setLinkedInProfile] = useState<
    LinkedInProfile | undefined
  >(undefined);
  const [linkedInVarsExtra, setLinkedInVarsExtra] = useState<Record<string, string>>({});
  const [hubSpotVariables, setHubspotVariables] = useState<Record<string, string>>({});
  const [customVariables, setCustomVariables] = useState<Dictionary<string>>(
    {},
  );
  const [playResults, setPlayResults] = useState<
    RunFinalPlayResponseType | undefined
  >();

  // -- Business Logic

  const [detectedPersonaName, personaData] = Object.entries(
    linkedInProfile?.persona || {},
  )?.[0] || ["", {}];
  const companyAndPersonaVariables = merge(
    {},
    companyAndUserVariables,
    personaData,
  );
  const companyAndPersonaKeys = Object.keys(companyAndPersonaVariables);

  const linkedInVariables = linkedInProfile?.profile_data || {};
  const linkedInExtraKeys = Object.keys(linkedInVarsExtra || {});
  const linkedInKeys = Object.keys(linkedInVariables);

  // Map common unprefixed aliases expected by plays to enrichment variables
  const aliasVariables: Record<string, string> = (() => {
    const vars: Record<string, string> = {};
    const source = { ...(linkedInVarsExtra || {}), ...(hubSpotVariables || {}) } as Record<string, any>;
    const sourceLI = linkedInVariables as Record<string, any>;

    // Debug logging for alias creation
    console.log('🔍 Workbench Alias Creation - Source Data:', source);
    console.log('🔍 Workbench Alias Creation - LinkedIn Variables:', linkedInVariables);

    // 0) Generic normalization: for every key, add a snake_case alias
    const toSnake = (k: string) => k
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    for (const [key, value] of Object.entries(source)) {
      const snake = toSnake(key);
      if (!(snake in source)) {
        vars[snake] = String(value ?? "");
      }
    }

    // 1) Generic aliasing: for every company_* key, add an unprefixed alias if not present
    for (const [key, value] of Object.entries(source)) {
      if (key.startsWith("company_")) {
        const unprefixed = key.slice("company_".length);
        if (!(unprefixed in source)) {
          vars[unprefixed] = String(value ?? "");
        }
      }
    }

    // 2) Specific convenience aliases
    if (source["company_description"]) vars["description"] = String(source["company_description"]);
    if (source["company_website"]) vars["website"] = String(source["company_website"]);
    // HubSpot fallback for website
    if (!vars["website"]) {
      const hsWebsite = (source as any)["hubspot_company_website"];
      if (hsWebsite) vars["website"] = String(hsWebsite);
    }

    // Synonyms: website_alias/site -> website, sourceid -> source_id
    const websiteAlias = source["website_alias"] ?? source["site"] ?? vars["website_alias"] ?? vars["site"];
    if (websiteAlias && !vars["website"]) vars["website"] = String(websiteAlias);
    const sourceId = source["sourceid"] ?? vars["sourceid"];
    if (sourceId && !vars["source_id"]) vars["source_id"] = String(sourceId);

    // Pass-through: top_previous_companies
    if (source["top_previous_companies"]) vars["top_previous_companies"] = String(source["top_previous_companies"]);

    // 3) Simplified alias for employees count change
    const changeKey = source["company_employees_count_change_yearly_percentage"]
      ? "company_employees_count_change_yearly_percentage"
      : ("employees_count_change_yearly_percentage" in source
        ? "employees_count_change_yearly_percentage"
        : undefined);
    if (changeKey) {
      vars["employees_count_change"] = String(source[changeKey]);
    }
    if (!("employees_count_change" in vars) && !("employees_count_change" in source)) {
      vars["employees_count_change"] = "";
    }

    // 4) Map base_salary from LinkedIn projected salary fields if present
    const liBase = sourceLI?.projected_base_salary_median
      ?? sourceLI?.projected_total_salary_median
      ?? sourceLI?.projected_base_salary_p50
      ?? sourceLI?.projected_total_salary_p50;
    if (liBase !== undefined && liBase !== null) {
      vars["base_salary"] = String(liBase);
    }

    // 5) Map average_visit_duration_seconds from company analytics if present
    const avgVisit = source["company_average_visit_duration_seconds"] ?? source["average_visit_duration_seconds"] ?? vars["company_average_visit_duration_seconds"];
    if (avgVisit !== undefined && avgVisit !== null) {
      vars["average_visit_duration_seconds"] = String(avgVisit);
    }

    // 6) Guarantee presence of expected keys so prompts never error due to missing variables
    if (!("website" in vars) && !("website" in source)) vars["website"] = "";
    if (!("base_salary" in vars) && !("base_salary" in source)) vars["base_salary"] = "";
    if (!("average_visit_duration_seconds" in vars) && !("average_visit_duration_seconds" in source)) vars["average_visit_duration_seconds"] = "";

    // Debug logging for final alias variables
    console.log('🔍 Workbench Final Alias Variables:', vars);
    console.log('🔍 Workbench Website Variable:', vars["website"]);
    console.log('🔍 Workbench Description Variable:', vars["description"]);

    return vars;
  })();
  const aliasKeys = Object.keys(aliasVariables);

  // Create alias variables expected by plays (e.g., generic `description`)
  const descriptionAliasCandidate =
    linkedInVarsExtra["company_description"] ||
    (linkedInVariables as any)["linkedin_current_company_description"] ||
    (linkedInVariables as any)["linkedin_company_description"] ||
    (linkedInVariables as any)["linkedin_profile_summary"] ||
    (linkedInVariables as any)["linkedin_summary"] ||
    "";
  const aliasVars: Record<string, string> = {};
  if (descriptionAliasCandidate) {
    aliasVars.description = String(descriptionAliasCandidate);
  }

  // If any inputs change clear output
  useEffect(() => {
    setPlayResults(undefined);
  }, [
    selectedPlay?.id,
    linkedInProfile?.profile_id,
    JSON.stringify(customVariables),
  ]);

  // After user loads LinkedIn data or if users changes LinkedIn profile, we need to run all smart variable plays to get all smart variables available to us.
  const {
    data: smartVariablesData = [],
    isFetching: isLoadingSmartVariables,
    error: errorSmartVariables,
  } = useBackendQuery<PlayRanServerSide[]>(
    `smart-variables/?profile_id=${linkedInProfile?.profile_id}`,
    {
      enabled: !!linkedInProfile?.profile_id,
    },
  );
  const smartVariables = smartVariablesData.reduce<Dictionary<string>>(
    (acc, sv) => ({
      ...acc,
      [sv.name]: sv.value ?? "⛔️ error",
    }),
    {},
  );

  // We want to be able to see the raw smart variables returned by server for debugging, but only filteredSmartVariables should be used to run plays
  const filteredSmartVariables = Object.fromEntries(
    Object.entries(smartVariables).filter(
      ([, value]) => isValidSmartVariableValue(value),
    ),
  );
  const smartVariableKeys = Object.keys(filteredSmartVariables);

  // System variables that are always available
  const systemVariables: Dictionary<string> = {
    today_date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
  };
  const systemVariableKeys = Object.keys(systemVariables);

  // In the dropdown want to show which of the plays will be able to be run at this point vs the ones that require additional manual data to be entered.
  // We can do this by computing what additional variables are required for each play. While this is more complex and will take longer than
  // simply getting a boolean of if it is ready to run, this will save us work later as we need need the full var list for whatever play is selected.
  const knownKeys = [
    ...companyAndPersonaKeys,
    ...linkedInKeys,
    ...linkedInExtraKeys,
    ...aliasKeys,
    ...smartVariableKeys,
    ...systemVariableKeys,
  ];
  const requiredCustomKeysForPlay: { [playId: number]: string[] } =
    finalOutputPlays.reduce((acc, play) => {
      const playSteps = play?.play_steps || [];
      const { requiredKeys: rk } = requiredKeys(playSteps);
      const requiredCustomKeys = rk.filter((key) => !knownKeys.includes(key));
      return {
        ...acc,
        [play.id]: requiredCustomKeys,
      };
    }, {});

  // Sort plays that don't require custom vars first in the list of plays that can be run
  const isPlayAbleToRunWithoutCustomVars = (play: Play) =>
    requiredCustomKeysForPlay[play.id].length === 0;
  const playToDropdownOption = (play: Play) => ({
    id: play.id,
    label: isPlayAbleToRunWithoutCustomVars(play) ? (
      play.name
    ) : (
      <span>⚠️ {play.name}</span>
    ),
  });
  const playDropdownOption = finalOutputPlays
    .sort((a) => (isPlayAbleToRunWithoutCustomVars(a) ? -1 : 1))
    .map(playToDropdownOption);

  // Once a play is selected, Figure out which variables are missing and make the user enter them in custom variables table entry
  const requiredCustomKeys = selectedPlay?.id
    ? requiredCustomKeysForPlay[selectedPlay.id]
    : [];
  useEffect(() => {
    const variableDict = requiredCustomKeys.reduce<Dictionary<string>>(
      (acc, key) => ({
        ...acc,
        // Retain values already set (possibly used in last play) if possible
        [key]: customVariables?.[key] || "",
      }),
      {},
    );
    setCustomVariables(variableDict);
  }, [JSON.stringify(requiredCustomKeys)]);

  // We are now ready to run the play.
  const {
    mutateAsync: _runPlay,
    isPending: isLoadingRun,
    // TODO: Show `error` if there is one
  } = useBackendMutation<
    {
      external_data: Dictionary<string>;
      persona_data: Dictionary<string[]>;
    },
    RunFinalPlayResponseType
  >(`plays/${selectedPlay?.id}/run/`, "PUT");

  const nonCompanyVariables = {
    ...systemVariables,
    ...hubSpotVariables,
    ...linkedInVariables,
    ...linkedInVarsExtra,
    ...aliasVariables,
    ...filteredSmartVariables,
    ...customVariables,
  };

  // Debug logging for variables being passed to plays
  console.log('🔍 Workbench nonCompanyVariables:', nonCompanyVariables);
  console.log('🔍 Workbench companyAndPersonaVariables:', companyAndPersonaVariables);
  const allVariablesForLLM = merge({}, companyAndPersonaVariables, nonCompanyVariables);
  console.log('🔍 Workbench allVariablesForLLM:', allVariablesForLLM);
  console.log('🔍 Workbench allVariablesForLLM keys:', Object.keys(allVariablesForLLM));
  console.log('🔍 Workbench Website in allVariablesForLLM:', allVariablesForLLM['website']);
  console.log('🔍 Workbench Company Website in allVariablesForLLM:', allVariablesForLLM['company_website']);

  const runPlay = () => {
    if (!selectedPlay) return;
    _runPlay({
      external_data: merge({}, companyAndPersonaVariables, nonCompanyVariables),
      persona_data: personaData,
    }).then((data) => {
      if (data) {
        setPlayResults(data);
      }
    });
  };

  // Just used for checking if play is ready to run and displaying error messages if not
  const { isReadyToRunAllSteps, missingVariables } = useRunLLM(
    selectedPlay?.play_steps || [],
    merge({}, companyAndPersonaVariables, nonCompanyVariables),
  );
  const missingOtherVars = missingVariables.filter(
    (v) => !companyAndPersonaKeys.includes(v),
  );

  return (
    <div className="w-full h-full divide-y flex flex-col">
      {isLoadingVariables ? (
        <p className="p-container">Loading...</p>
      ) : errorVariables ? (
        <p className="p-container error">⛔️ {errorVariables.message}</p>
      ) : (
        <>
          <div className="flex flex-shrink-0 flex-grow-0 divide-x">
            <div className="w-0 flex-grow p-container">
              <GetLinkedInData onLoadData={setLinkedInProfile} setHubspotVariables={setHubspotVariables} setLinkedInVariables={setLinkedInVarsExtra} hideDataTable />
            </div>
            <div className="flex flex-col gap-2 p-container">
              <label>View research:</label>
              {isLoadingSmartVariables ? (
                "Loading research..."
              ) : errorSmartVariables ? (
                "Error fetching research"
              ) : (
                <button
                  onClick={() => setIsSmartVariableModalOpen(true)}
                  className="btn-secondary h-fit w-fit"
                  disabled={!linkedInProfile}
                >
                  View Research
                </button>
              )}
            </div>
            <BaseModal
              show={isSmartVariableModalOpen}
              onClose={() => setIsSmartVariableModalOpen(false)}
            >
              <div className="p-container flex flex-col gap-2">
                <p>
                  Detected Persona:{" "}
                  <span className="font-medium">{detectedPersonaName}</span>
                </p>
                <DictionaryTable
                  data={{
                    ...smartVariables,
                    ...hubSpotVariables,
                  }}
                  label="Smart variable values generated using LinkedIn Data and HubSpot:"
                />
              </div>
            </BaseModal>
          </div>
          
          {/* Batch Viewer Section */}
          <div className="w-full p-container">
            <BatchViewer
              linkedInProfile={linkedInProfile}
              hubSpotVariables={hubSpotVariables}
              linkedInVarsExtra={linkedInVarsExtra}
              smartVariables={filteredSmartVariables}
              linkedInVariables={linkedInVariables}
              systemVariables={systemVariables}
            />
          </div>

          <div className="flex flex-shrink-0 flex-grow-0 divide-x">
            <div className="flex-shrink-0 flex-grow-0 flex flex-col gap-2 p-container">
              <label>Choose play to run:</label>
              {isLoadingPlays ? (
                "Loading plays..."
              ) : errorPlays ? (
                "Error fetching plays"
              ) : (
                <Dropdown
                  options={playDropdownOption}
                  selectedOption={
                    selectedPlay
                      ? { id: selectedPlay.id, label: selectedPlay.name }
                      : null
                  }
                  setSelectedOption={(option) =>
                    setSelectedPlay(
                      finalOutputPlays.find((p) => p.id === option.id),
                    )
                  }
                  placeholderText="Select a play..."
                  disabled={isEmpty(linkedInVariables)}
                  className="w-80"
                />
              )}
            </div>
            <div className="flex-shrink-0 flex-grow-0 p-container flex flex-col gap-2">
              <label>Set additional variables:</label>
              {isEmpty(customVariables) && selectedPlay ? (
                <p>
                  No additional variables
                  <br />
                  required for this play.
                </p>
              ) : (
                <button
                  onClick={() => setIsVariableSetterOpen(true)}
                  className="btn-secondary h-fit w-fit"
                  disabled={!selectedPlay}
                >
                  Open Variable Editor
                </button>
              )}
            </div>
            <BaseModal
              show={isVariableSetterOpen}
              onClose={() => setIsVariableSetterOpen(false)}
            >
              <div className="p-container">
                <DictionaryTable
                  isEditable
                  disableKeyEditing
                  data={customVariables}
                  onChange={setCustomVariables}
                  label="Set values for the following additional variables:"
                />
              </div>
            </BaseModal>
          </div>
          <div
            className={`flex divide-x flex-grow overflow-hidden ${playResults ? "" : "outer-container w-full"}`}
          >
            {playResults ? (
              playResults.map((result, i) => (
                <div
                  className={`outer-container w-1/${playResults.length}`}
                  key={i}
                >
                  <div className="inner-container flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <h2>Play Output</h2>
                      <p className="subtitle">
                        Using Company Data Value Set {i + 1}
                      </p>
                    </div>
                    {result ? (
                      <Markdown remarkPlugins={[remarkGfm]}>{result}</Markdown>
                    ) : (
                      <p className="error">
                        ⛔️ There was an error running this play. Please contact
                        support with the play name and we&apos;ll look into the
                        issue.
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : isLoadingRun ? (
              <p>Running...</p>
            ) : !linkedInProfile || !selectedPlay ? (
              <p className="subtitle">Finish steps above to run play.</p>
            ) : isReadyToRunAllSteps ? (
              <button
                className="btn-primary w-fit h-fit"
                onClick={() => runPlay()}
                disabled={!isReadyToRunAllSteps}
              >
                Run Play
              </button>
            ) : (
              <p className="error">
                ⛔️{" "}
                {missingOtherVars.length > 0 ? (
                  <>
                    Please click name and we&apos;ll look into the issue. Open
                    Variable Editor name and we&apos;ll look into the issue. to
                    set values for{" "}
                    <MissingVariablesList variables={missingOtherVars} />.
                  </>
                ) : (
                  <>
                    There is an error in the play preventing it from running.
                    Load the play in the Play Editor for more details. If no
                    errors are visible, please contact support with the play
                    name and we&apos;ll look into the issue.
                  </>
                )}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
