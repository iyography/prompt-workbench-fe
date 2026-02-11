import {Dictionary} from "lodash";
import {formatString, ReplacedVariable} from "./string-interpolation";
import {PlayStep} from "@/models/play";
import {levenshteinDistance} from "@/utils/levenshtein";


function hasMissingVariables(replacedVariables: ReplacedVariable[]) {
    for (const replacedVar of replacedVariables) {
        if (replacedVar.isMissing && !replacedVar.isOptional) {
            return true
        }
    }
    return false;
}

function getMissingVariableNames(replacedVariables: ReplacedVariable[]): string[] {
    return replacedVariables.filter(v => v.isMissing && !v.isOptional).map(v => v.name);
}


export const prepareToRunModel = (
    variables: Dictionary<string>,
    userInstructions?: string,
    systemInstructions?: string,
) => {
    const {
        formattedString: compiledSystemInstructions,
        replacedVariables: replacedSystemInstructionVariables,
    } = formatString(systemInstructions || "", variables);
    const {
        formattedString: compiledUserInstructions,
        replacedVariables: replacedUserInstructionVariables,
    } = formatString(userInstructions || "", variables);

    // We are ready to run the model if we have compiled instructions with no missing variables
    const isReady =
        compiledSystemInstructions &&
        compiledUserInstructions &&
        !hasMissingVariables(replacedSystemInstructionVariables) &&
        !hasMissingVariables(replacedUserInstructionVariables);
    return {
        isReady,
        compiledSystemInstructions,
        compiledUserInstructions,
        missingSystemInstructionsVariables: getMissingVariableNames(replacedSystemInstructionVariables),
        missingUserInstructionsVariables: getMissingVariableNames(replacedUserInstructionVariables),
    };
};

export const requiredKeys = (playSteps: PlayStep[]) => {
    let requiredKeys =
        playSteps?.reduce<string[]>((acc, step) => {
            const {replacedVariables: replacedSystemInstructionVariables} =
                formatString(step.system_instructions_template || "", {});
            const {replacedVariables: replacedUserInstructionVariables,} =
                formatString(step.user_instructions_template || "", {});
            return [
                ...acc,
                ...getMissingVariableNames(replacedSystemInstructionVariables),
                ...getMissingVariableNames(replacedUserInstructionVariables),
            ];
        }, []) || [];

    requiredKeys = requiredKeys.filter((v) => !v.startsWith("prompt"));

    return {
        requiredKeys,
    };
};

/**
 * Returns true if s1 and s2 are the same string module 1 char.
 */
function isSameAlmostTheSameString(s1: string, s2: string): boolean {
    if (Math.abs(s1.length - s2.length) > 3) { // short-circuit for extreme values.  3 is probably overkilled
        return false;
    }
    return levenshteinDistance(s1.toLowerCase(), s2.toLowerCase()) < 2
}

export function isValidSmartVariableValue(value: string | null | undefined): boolean {
    if (value === null || value === undefined) {
        return false;
    }
    value = value.trim();
    if (value === "⛔️ error") {
        return false;
    }
    return !isSameAlmostTheSameString(value, 'nothing');

}
