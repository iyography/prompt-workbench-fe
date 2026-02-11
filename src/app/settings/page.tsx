"use client";

import { IconButton } from "@/components/common/IconButton";
import { StringDataTable } from "@/components/common/StringDataTable";
import { BaseModal } from "@/components/modals/BaseModal";
import { useBackendMutation, useBackendQuery } from "@/hooks/networking";
import { Company, CompanyBD } from "@/models/company";
import { Pencil, Trash } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Dictionary, keys, merge } from "lodash";
import { Fragment, useState, useEffect } from "react";

const DEFAULT_COMPANY_VARIABLES = {

  "format_sonar_pro":[
      "I'm going to give you text. Your job is to remove everything between the \"<think>\" and output the remaining text with no other changes.",
      "I'm going to give you text. Your job is to remove everything between the \"<think>\" and output the remaining text with no other changes.",
      "I'm going to give you text. Your job is to remove everything between the \"<think>\" and output the remaining text with no other changes."
  ],
  "format_output": ["\"When writing use the following writing style guidelines:\n" +
  "- Do this in a spartan conversational and professional tone with no yapping.\n" +
  "- Don't make anything up, only use the information you're given.\n" +
  "- Don't use symbols or emojis\n" +
  "- If blank data is given to you, output only \"\"nothing\"\" in lowercase.\n" +
  "\n" +
  "Do not use these words under any circumstances: \"\"{dontuse}\"\"\""],

  "format_perplexity_output": ["I'm going to give you text. Your job is to remove any footnotes, remove any blank research, then format so it all looks the same. Don't include a description or explanation."],

  "format_research": ["I'm going to give you research on a buyer. Your job is to remove any research that came back with nothing after the \":\", remove any text that says \"nothing\", remove any headers with no research, and output the revised research report with each piece of research on a new line. Don't make any other changes. If there is no research output \"nothing\"."],

  "format_text": ["I'm going to give you text. Your job is to remove any footnotes, remove any blank research, and remove any headers with blank data. Don't include a description or explanation. If there is no text or the text says only nothing, output only 'nothing' in lowercase"],

  "perplexity_output_long": ["\"To format your output:\n" +
  "- If you find something, output a summary with 20-45 words.\n" +
  "- If you don't find anything, output only \"\"nothing\"\" in all lowercase.\n" +
  "- Don't output anything else.\""],

  "perplexity_output_short": ["\"To format your output:\n" +
  "- If you find something, output a summary with 10-20 words.\n" +
  "- If you don't find anything, output only \"\"nothing\"\" in all lowercase.\n" +
  "- Don't output anything else.\""],

  "3_paragraph": [
      "Your job is to write a 3 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 55 words in total.",
      "Your job is to write a 3 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 55 words in total.",
      "Your job is to write a 3 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 55 words in total.",
  ],

  "4_paragraph": [
      "Your job is to write a 4 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 75 words in total.",
    "Your job is to write a 4 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 75 words in total.",
      "Your job is to write a 4 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 75 words in total."
  ],

  "5_paragraph": [
      "Your job is to write a 5 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 75 words in total.",
    "Your job is to write a 5 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 75 words in total.",
      "Your job is to write a 5 paragraph email, where each paragraph is only one sentence long and each paragraph is separated by a blank line/space. Use no more than 75 words in total."
  ],

  "cycle":["1", "2", "3"],

  "dontuse": ["Ambitious, Precision, Level up, Skillful, Maneuvering, Generate, Strategy, Supercharge, Turbocharge, Maximizing, Expert, Enhancing, Boosting, Impactful, Swift, Streamline, game-changer, Effortlessly, Efficiency, Maximize,  Workflow, Precision, Accelerating, Success, Effectively, Scrum, Victories, Ineffectively, Similarly, Win, Optimizing, Swiftly, Efficiently, Your Needs, However, Dig, Mega, Bums, Boost, Key, Success, Super, Impactful, Successes, Smoother, Tailored, Themes, Mega, Snag, Rad, Dude, Yo, Homie, Optimal, Optimum, Aspects, Skills, Velocity, Battle, Ripping, Predicament, Slick, Sleek, Crucial, 'Cause, Goals, Scale, Excel, Lack, Effective, Time-consuming, Tedious, Curious, Valuable, High-quality"],

  "email_format": ["\"When writing use the following writing style guidelines:\n" +
  "- Do this in a spartan conversational and professional tone with no yapping\n" +
  "- Be executive and brief, not rude but efficient with your words\n" +
  "- Don't use buzzwords or words that sound salesy\n" +
  "- Don't complement them\n" +
  "- Don't start paragraphs with \"\"I\"\" or \"\"Similarly\"\" and don't use any \"\"!\"\". \n" +
  "- Don't make anything up, only use the information you're given.\n" +
  "- Don't use symbols or emojis\n" +
  "- Instead of saying \"\"I saw\"\" or \"\"Noticed X\"\", use words focused on them like: \"\"it looks like, sounds like, it seems like, you know, you know how, you seem to understand, it looks like you\"\"\n" +
  "- Separate each paragraph with a blank line\n" +
  "- Create a narrative across the paragraphs that flows from one to the next\""],

  "email_framework":["\"- Intro\n" +
  "- Challenge/Pain\n" +
  "- Problem\n" +
  "- Solution\n" +
  "- Interest-based CTA\"", "\"- Intro\n" +
  "- Problem\n" +
  "- Pain\n" +
  "- Solution\n" +
  "- Interest-based CTA\"", "\"- Intro\n" +
  "- Challenge\n" +
  "- Pain\n" +
  "- Problem\n" +
  "- Solution + Interest-based CTA\""],

  "linkedin_company_data":["\"Open job roles: {linkedin_str_current_company_jobs_titles?}\n" +
  "Job descriptions: {job_descriptions?}\n" +
  "Company Posts: {linkedin_str_current_company_updates_long?}\""],

  "linkedin_profile_data_long":["\"{linkedin_summary?}\n" +
  "{linkedin_headline?}\n" +
  "{linkedin_str_education_with_descriptions?}\n" +
  "{linkedin_str_job_history_with_descriptions?}\n" +
  "{linkedin_str_accomplishments?}\""],

  "linkedin_profile_data_short":["\"{linkedin_summary?}\n" +
  "{linkedin_headline?}\n" +
  "{linkedin_str_job_history?}\n" +
  "{linkedin_str_education_with_descriptions?}\n" +
  "{linkedin_str_accomplishments?}\""],

  "tone":["weave in the tone of a professional Mike Ditka", "weave in the tone of a professional Mike Ditka", "weave in the tone of a professional Mike Ditka"],

  "CTAs":[
      "\"Is this worth a conversation?\", \"Open to learning more?\", \"Interested to learn more?\", \"Open to hearing how?\", \"Open to seeing how?\", \"Have you considered X?\", \"Have you experimented with X in the past?\", \"Any interest in X?\", \"Interested in X?\", \"Have you seen our platform?\", \"Are you familiar with our platform\", \"Are you familiar with our tech?\", \"Have you seen our tech?\"",
      "\"Is this worth a conversation?\", \"Open to learning more?\", \"Interested to learn more?\", \"Open to hearing how?\", \"Open to seeing how?\", \"Have you considered X?\", \"Have you experimented with X in the past?\", \"Any interest in X?\", \"Interested in X?\", \"Have you seen our platform?\", \"Are you familiar with our platform\", \"Are you familiar with our tech?\", \"Have you seen our tech?\"",
      "\"Is this worth a conversation?\", \"Open to learning more?\", \"Interested to learn more?\", \"Open to hearing how?\", \"Open to seeing how?\", \"Have you considered X?\", \"Have you experimented with X in the past?\", \"Any interest in X?\", \"Interested in X?\", \"Have you seen our platform?\", \"Are you familiar with our platform\", \"Are you familiar with our tech?\", \"Have you seen our tech?\""
  ],

  "company_context": ["", "", ""],
  "competitor_context": ["", "", ""]

};

export default function Settings() {
  // Networking
  const { data: companies, isFetching } =
    useBackendQuery<Company[]>("companies/");
  const company = companies?.[0]; // Right now, users will only have one company, so we'll just take the first object

  const queryClient = useQueryClient();
  const { mutate, error: errorUpdating } = useBackendMutation<
    Partial<CompanyBD>,
    Company
  >(`companies/${company?.id}/`, "PATCH", {
    onSuccess(data) {
      // Since we know the list endpoint will always only return one response, we can replace the cached data for
      // that endpoint with the modified company (so that data will be correct)
      queryClient.setQueryData<Company[]>(["companies/"], [data]);
    },
  });

  // State
  const [attemptingUpdateOf, setAttemptingUpdateOf] = useState<
    "company_variables" | "personas"
  >("company_variables");
  const [
    isEditPersonaNameOpenForPersonaName,
    setIsEditPersonaNameOpenForPersonaName,
  ] = useState<string | false>(false);

  const [linkedinJobSearchTerm, setLinkedinJobSearchTerm] = useState<string>("");
  const [linkedinJobLocation, setLinkedinJobLocation] = useState<string>("");
  const [nbrLinkedinDesc, setNbrLinkedinDesc] = useState<number>(company?.linkedin_max_job_details ?? 0);

  const [personaNameInput, setPersonaNameInput] = useState<string>(company?.linkedin_job_search_term ?? '');
  const [isUpdating, setIsUpdating] = useState(false);

  // New state variables for context text boxes
  const [companyContextInput, setCompanyContextInput] = useState<string>("");
  const [competitorContextInput, setCompetitorContextInput] = useState<string>("");

  // Merged company variables (combines hardcoded defaults with company data)
  const [mergedCompanyVariables, setMergedCompanyVariables] = useState<CompanyBD["company_variables"]>({});

  // Custom variables (user-created variables that are NOT in the defaults)
  const [customVariables, setCustomVariables] = useState<CompanyBD["company_variables"]>({});

  // USE EFFECT HERE
  useEffect(() => {
    if (company) {
      setLinkedinJobSearchTerm(company.linkedin_job_search_term || "");
      setLinkedinJobLocation(company.linkedin_job_location || "United States");
      setNbrLinkedinDesc(company.linkedin_max_job_details || 0);
      setPersonaNameInput(company.linkedin_job_search_term || "");

      // Merge the hardcoded variables with the company's existing variables
      const combined = merge({}, DEFAULT_COMPANY_VARIABLES, company.company_variables || {});
      setMergedCompanyVariables(combined);

      // Extract custom variables (variables that are NOT in the defaults)
      const defaultKeys = Object.keys(DEFAULT_COMPANY_VARIABLES);
      const companyVars = company.company_variables || {};
      const customVars: CompanyBD["company_variables"] = {};
      Object.keys(companyVars).forEach((key) => {
        if (!defaultKeys.includes(key)) {
          customVars[key] = companyVars[key];
        }
      });
      setCustomVariables(customVars);

      // Initialize context text inputs from the first value of each array
      setCompanyContextInput(combined.company_context?.[0] || "");
      setCompetitorContextInput(combined.competitor_context?.[0] || "");
    } else {
      // If no company data yet, just use the defaults
      setMergedCompanyVariables(DEFAULT_COMPANY_VARIABLES);
      setCustomVariables({});
      setCompanyContextInput("");
      setCompetitorContextInput("");
    }
  }, [company]);

  // Business Logic
  const setVariables = (company_variables: CompanyBD["company_variables"]) => {
    if (company) {
      setAttemptingUpdateOf("company_variables");
      setMergedCompanyVariables(company_variables);
      mutate({ company_variables });
    }
  };

  // Handler for custom variables - merges with existing company variables
  const setCustomVariablesHandler = (newCustomVars: CompanyBD["company_variables"]) => {
    if (company) {
      setAttemptingUpdateOf("company_variables");
      setCustomVariables(newCustomVars);

      // Merge custom variables with the company values (excluding old custom vars)
      const defaultKeys = Object.keys(DEFAULT_COMPANY_VARIABLES);
      const existingCompanyVars = company.company_variables || {};

      // Keep only the default-based variables from existing
      const baseVars: CompanyBD["company_variables"] = {};
      defaultKeys.forEach((key) => {
        if (existingCompanyVars[key]) {
          baseVars[key] = existingCompanyVars[key];
        }
      });

      // Merge with new custom variables
      const combined = { ...baseVars, ...newCustomVars };
      mutate({ company_variables: combined });
    }
  };

  const setPersonas = (personas: Company["personas"]) => {
    if (company) {
      setAttemptingUpdateOf("personas");
      mutate({ personas });
    }
  };

  const setLinkedInJobParameters = (linkedin_job_search_term: Company['linkedin_job_search_term'],
                                    linkedin_job_location: Company['linkedin_job_location'],
                                    linkedin_max_job_details: Company['linkedin_max_job_details']) => {
    const clamped = Math.min(5, Math.max(0, Number(linkedin_max_job_details || 5)));
    console.log('🔍 Settings - Saving job parameters (clamped to <=5):', {
      linkedin_job_search_term,
      linkedin_job_location,
      linkedin_max_job_details: clamped
    });
    mutate({linkedin_job_search_term, linkedin_job_location, linkedin_max_job_details: clamped as any});
  };

  // Helper functions for context variables
  const updateCompanyContext = (value: string) => {
    setCompanyContextInput(value);
    const updatedVariables = {
      ...mergedCompanyVariables,
      company_context: [value, value, value] // Copy to all three positions
    };
    setVariables(updatedVariables);
  };

  const updateCompetitorContext = (value: string) => {
    setCompetitorContextInput(value);
    const updatedVariables = {
      ...mergedCompanyVariables,
      competitor_context: [value, value, value] // Copy to all three positions
    };
    setVariables(updatedVariables);
  };

  const handleSaveCompany = () => {
    if (!company) return;
    
    setIsUpdating(true);
    mutate(
      {
        company_variables: company.company_variables,
        personas: company.personas,
        linkedin_job_search_term: company.linkedin_job_search_term,
        linkedin_job_location: company.linkedin_job_location,
        linkedin_max_job_details: company.linkedin_max_job_details,
      },
      {
        onSuccess: () => {
          setAttemptingUpdateOf("company_variables");
          queryClient.invalidateQueries({ queryKey: ["companies"] });
          setIsUpdating(false);
          // Show success message
          alert("Company settings saved successfully!");
        },
        onError: (error) => {
          console.error("Error saving company settings:", error);
          setIsUpdating(false);
          alert("Error saving company settings. Please try again.");
        }
      }
    );
  };

  const personas = company?.personas || {};
  if (!personas["Default"]) {
    personas["Default"] = {};
  }

  const defaultPersona = personas["Default"];
  const addPersona = (name: string) => {
    // Automatically populate variable names from other personas
    const defaultValue: Dictionary<string[]> = {};
    keys(defaultPersona).forEach((key) => {
      defaultValue[key] = [];
    });
    setPersonas({
      ...personas,
      [name]: defaultValue,
    });
  };

  const removePersona = (name: string) => {
    const newPersonas = { ...personas };
    delete newPersonas[name];
    setPersonas(newPersonas);
  };

  const setPersonaVariables = (
    name: string,
    variables: Dictionary<string[]>,
  ) => {
    setPersonas({
      ...personas,
      [name]: variables,
    });
  };

  const renamePersona = (oldName: string, newName: string) => {
    if (
      personas[newName] ||
      !personas[oldName] ||
      newName === "Default" ||
      oldName === newName
    ) {
      return;
    }

    const newPersonas = { ...personas };
    newPersonas[newName] = newPersonas[oldName];
    delete newPersonas[oldName];
    setPersonas(newPersonas);
  };

  const allPersonasHaveSameKeys = Object.values(personas).every(
    (variables) =>
      keys(variables).sort().join() === keys(defaultPersona).sort().join()
  );

  return (
    <div className="outer-container w-full">
      <div className="inner-container">
        <div>
          <BaseModal
            show={Boolean(isEditPersonaNameOpenForPersonaName)}
            onClose={() => setIsEditPersonaNameOpenForPersonaName(false)}
          >
            <div className="px-4 py-5 sm:p-6 w-full flex flex-col gap-2">
              <label htmlFor="play_name">
                Rename persona from {isEditPersonaNameOpenForPersonaName}
              </label>
              <input
                value={personaNameInput}
                onChange={(e) => setPersonaNameInput(e.target.value)}
                type="text"
                name="play_name"
                id="play_name"
                autoComplete="off"
                className="block w-full primary-input"
              />
              {Boolean(personas?.[personaNameInput]) &&
                personaNameInput !== isEditPersonaNameOpenForPersonaName && (
                  <p className="error">
                    ⛔️ A persona with this name already exists
                  </p>
                )}
              <div className="flex mt-1 gap-2 items-center">
                <button
                  disabled={
                    Boolean(personas?.[personaNameInput]) ||
                    !personaNameInput ||
                    personaNameInput === isEditPersonaNameOpenForPersonaName
                  }
                  type="submit"
                  className="btn-primary flex-grow-0 flex-shrink-0 w-fit"
                  onClick={() => {
                    if (!isEditPersonaNameOpenForPersonaName) return;
                    renamePersona(
                      isEditPersonaNameOpenForPersonaName,
                      personaNameInput,
                    );
                    setIsEditPersonaNameOpenForPersonaName(false);
                  }}
                >
                  Save
                </button>
              </div>

            </div>
          </BaseModal>
          {isFetching ? (
            <p>Loading...</p>
          ) : company ? (
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-4">
                <h1>Setup Company</h1>
                {errorUpdating && attemptingUpdateOf == "company_variables" && (
                  <p className="error">
                    ⛔️ There was an error saving your Company data. Please
                    reload the page and try again.
                  </p>
                )}
                {/* Company Setup Section - Cleaned up and organized */}
                <div className="flex flex-col gap-6">
                  <h2 className="text-xl font-semibold">Company Setup</h2>
                  
                  {errorUpdating && attemptingUpdateOf == "company_variables" && (
                    <p className="error">
                      ⛔️ There was an error saving your Company data. Please
                      reload the page and try again.
                    </p>
                  )}

                  {/* Context Variables Section */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">Context Variables</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Context
                        </label>
                        <input
                          type="text"
                          value={companyContextInput}
                          onChange={(e) => updateCompanyContext(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter your company context..."
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This will be copied to all three value positions
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Competitor Context
                        </label>
                        <input
                          type="text"
                          value={competitorContextInput}
                          onChange={(e) => updateCompetitorContext(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter your competitor context..."
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This will be copied to all three value positions
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Company Values Section */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">Company Values</h3>
                <StringDataTable
                  isEditable
                  data={mergedCompanyVariables}
                  onChange={setVariables}
                  label="Add your company data which can be used across all plays:"
                  valuesPerRow={3}
                />
                  </div>

                  {/* LinkedIn Research Configuration - CONSOLIDATED */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">LinkedIn Research Configuration</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Configure what data to fetch when researching prospects on LinkedIn
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Job Titles */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Job Titles to Search 💼
                        </label>
                        <input
                          type="text"
                          value={company?.linkedin_job_search_term || ''}
                          onChange={(e) => {
                            if (company) {
                              mutate({
                                ...company,
                                linkedin_job_search_term: e.target.value
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Account Executive, Sales Development"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Comma-separated job titles to find at the prospect's company
                        </p>
                      </div>
                      
                      {/* Location */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Job Location 📍
                        </label>
                        <input
                          type="text"
                          value={company?.linkedin_job_location || 'United States'}
                          onChange={(e) => {
                            if (company) {
                              mutate({
                                ...company,
                                linkedin_job_location: e.target.value
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="United States"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Geographic location for job search
                        </p>
                      </div>
                      
                      {/* Max Jobs */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max Job Postings 📋
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={company?.linkedin_max_jobs || 5}
                          onChange={(e) => {
                            if (company) {
                              mutate({
                                ...company,
                                linkedin_max_jobs: parseInt(e.target.value) || 5
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Number of job postings to retrieve (1-10)
                        </p>
                      </div>
                      
                      {/* Max Posts */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Max LinkedIn Posts 📝
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={company?.linkedin_max_posts || 10}
                          onChange={(e) => {
                            if (company) {
                              mutate({
                                ...company,
                                linkedin_max_posts: parseInt(e.target.value) || 10
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Number of posts to retrieve from prospect's profile (1-20)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Custom Variables Section */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium mb-3">Custom Variables</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Add your own custom variables that can be used across all plays.
                      These are separate from the system Company Values above.
                    </p>
                    {Object.keys(customVariables).length === 0 ? (
                      <div className="text-gray-500 text-sm py-4 text-center border-2 border-dashed border-gray-300 rounded-lg">
                        No custom variables yet. Use the table below to add your own.
                      </div>
                    ) : null}
                    <StringDataTable
                      isEditable
                      data={customVariables}
                      onChange={setCustomVariablesHandler}
                      label="Custom company variables:"
                      valuesPerRow={3}
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSaveCompany()}
                      disabled={!company || isUpdating}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isUpdating ? 'Saving...' : 'Save Company Settings'}
                  </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <h1>Setup Personas</h1>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className="btn btn-primary w-fit"
                    onClick={() =>
                      addPersona(`Persona ${keys(personas).length + 1 || 1}`)
                    }
                  >
                    Add New Persona
                  </button>
                  {!allPersonasHaveSameKeys && (
                    <p className="error">
                      ⛔️ All Personas must have the same set of Variable names
                    </p>
                  )}
                  {errorUpdating && attemptingUpdateOf == "personas" && (
                    <p className="error">
                      ⛔️ There was an error saving your Company data. Please
                      reload the page and try again.
                    </p>
                  )}
                </div>

                {Object.entries(personas)
                  .sort()
                  .sort(([a], [b]) =>
                    a === "Default" ? -1 : b === "Default" ? 1 : 0,
                  )
                  .map(([name, variables]) => (
                    <Fragment key={name}>
                      <div className="flex gap-4 items-center">
                        <h2>{name}</h2>
                        {name !== "Default" && (
                          <>
                            <IconButton
                              onClick={() => {
                                setPersonaNameInput(name);
                                setIsEditPersonaNameOpenForPersonaName(name);
                              }}
                              size={20}
                              className="flex-shrink-0 flex-grow-0"
                              Icon={Pencil}
                            />
                            <IconButton
                              onClick={() => removePersona(name)}
                              Icon={Trash}
                              size={20}
                            />
                          </>
                        )}
                      </div>
                      <StringDataTable
                        isEditable
                        data={variables}
                        onChange={(newVariables) =>
                          setPersonaVariables(name, newVariables)
                        }
                        label={`Add your ${name} persona data:`}
                        valuesPerRow={3}
                      />
                    </Fragment>
                  ))}


              </div>
            </div>
          ) : (
            <p className="error">
              ⛔️ There was an error loading your Company and Personas, please
              contact support.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}