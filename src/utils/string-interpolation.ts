// src/utils/string-interpolation.ts
interface Dictionary<T> {
    [index: string]: T;
}

export type FormatStringResult = {
    formattedString: string;
    replacedVariables: ReplacedVariable[];
};

type FormatVar = {
    start: number;
    end: number;
    key: string;
    isOptional: boolean;
    hasValue: boolean;
    value: string | undefined;
};

export type ReplacedVariable = {
    name: string;
    isOptional: boolean;
    value: string | undefined;
    isMissing: boolean;
};

function* getVars(str: string, availableKeys: Dictionary<string>): Generator<FormatVar, void, unknown> {
    const re = /{\w+\??}/g;
    let group;
    while ((group = re.exec(str)) !== null) {
        const key = group[0].replace(/^{/g, '').replace(/\??}$/g, '');
        yield {
            start: group.index,
            end: group.index + group[0].length,
            key: key,
            isOptional: group[0].endsWith('?}'),
            hasValue: availableKeys.hasOwnProperty(key),
            value: availableKeys[key],
        };
    }
}

function isFinished(str: string, variables: Dictionary<string>): boolean {
    const vars = Array.from(getVars(str, variables));
    return vars.every((v) => v.value === undefined);
}

function formatStringOne(str: string, variables: Dictionary<string>): [string, ReplacedVariable[], boolean] {
    const varsToReplace = Array.from(getVars(str, variables)).reverse();
    if (varsToReplace.length < 1) {
        return [str, [], true];
    }
    const replacedVariables: ReplacedVariable[] = [];
    for (const varToReplace of varsToReplace) {
        const rv: ReplacedVariable = {
            name: varToReplace.key,
            value: varToReplace.value,
            isOptional: varToReplace.isOptional,
            isMissing: varToReplace.value === undefined,
        };
        replacedVariables.push(rv);

        if (varToReplace.value !== undefined) {
            str = str.substring(0, varToReplace.start) + varToReplace.value + str.substring(varToReplace.end);
        }
    }
    return [str, replacedVariables, isFinished(str, variables)];
}

function removeOptionalVariables(str: string): string {
    return str.replace(/{\w+\?}/g, '');
}

// Interpolate variables into a string templates (and detect missing variables)
export function formatString(str: string, variables: Dictionary<string>): FormatStringResult {
    // Stupidly complicated function.  Basically, we want to replace
    // variables recursively until there's no more variable left to
    // replace.  To avoid infinite loop, we place a maximum of (around)
    // 10 (zero warranty) composed variables.

    let ret: string;
    let finished: boolean;
    let recurDept = 0;
    let replacedVars: ReplacedVariable[] = [];
    const replacedVariables: ReplacedVariable[] = [];

    for ([ret, finished] = [str, false]; !finished; [ret, replacedVars, finished] = formatStringOne(ret, variables)) {
        recurDept++;
        replacedVariables.push(...replacedVars);
        if (recurDept > 10) {
            throw new Error(`Maximum recursion while replacing variables in ${str}`);
        }
    }
    replacedVariables.push(...replacedVars);

    return {
        formattedString: removeOptionalVariables(ret),
        replacedVariables: replacedVariables,
    };
}

// NEW FUNCTION: Prepares data for play execution by resolving nested variables
export function prepareDataForPlay(data: Record<string, string>): Record<string, string> {
  // Create a copy to avoid modifying the original
  const processed = {...data};
  
  // First, let's identify which variables have nested references
  const containsReferences = Object.keys(processed).filter(key => {
    if (typeof processed[key] !== 'string') return false;
    // Check if this variable's value contains other variable references
    return /{[^{}]+\??}/.test(processed[key]);
  });
  
  // Process these variables first to resolve their nested references
  containsReferences.forEach(key => {
    const { formattedString } = formatString(processed[key], processed);
    processed[key] = formattedString;
  });
  
  // Now process all variables one more time to catch any remaining substitutions
  Object.keys(processed).forEach(key => {
    if (typeof processed[key] === 'string') {
      const { formattedString } = formatString(processed[key], processed);
      processed[key] = formattedString;
    }
  });
  
  return processed;
}