import {Play} from "../../models/play";
import {Dropdown} from "../../components/common/Dropdown";
import {PlaySelectorProps} from "../types/execute-view.types";
import {togglePrivateAdminView} from "@/sidepanel/components/PrivateAdmin";
import {useState} from "react";

function togglePrivateAdminViewOnClick(e: any): void {
    if (e?.detail === 2) {
        togglePrivateAdminView();
    }
}

export function PlaySelector({
                                 runPlay,
                                 plays,
                                 selectedPlay,
                                 setSelectedPlay,
                                 isPlayAbleToRunWithoutCustomVars,
                                 loading,
                             }: PlaySelectorProps) {
    const [numOutputsOverride, setNumOutputsOverride] = useState<string>("default");
    const playToDropdownOption = (play: Play) => ({
        containerProps: {
            className: isPlayAbleToRunWithoutCustomVars(play)
                ? "bg-green-50 hover:bg-green-100"
                : "bg-red-50 hover:bg-red-100",
        },
        id: play.id,
        visible: play.visible,
        label: play.name,
        tooltip: isPlayAbleToRunWithoutCustomVars(play) ? undefined : loading ? (
            <p className="text-center text-sm">Loading variables...</p>
        ) : (
            <p className="text-center text-sm">More research required to run play.</p>
        ),
    });

    const playDropdownOptions = plays
    .sort((a, b) => a.name.localeCompare(b.name))
    .sort(
        (a, b) =>
            (isPlayAbleToRunWithoutCustomVars(a) ? -1 : 1) -
            (isPlayAbleToRunWithoutCustomVars(b) ? -1 : 1),
    )
    .map(playToDropdownOption);

    const outputCountOptions = [
        { id: "default", label: "default" },
        { id: "1", label: "1" },
        { id: "2", label: "2" },
        { id: "3", label: "3" },
    ];

    const selectedOutputOption = outputCountOptions.find(opt => opt.id === numOutputsOverride) || outputCountOptions[0];

    return (
        <div className="flex flex-col gap-2 items-start w-full">
            <div className="flex items-center gap-3 w-full">
                <label onClick={togglePrivateAdminViewOnClick} className="whitespace-nowrap">Create Message:</label>
                <div className="w-[120px] ml-auto">
                    <Dropdown
                        options={outputCountOptions}
                        selectedOption={selectedOutputOption}
                        setSelectedOption={(option) => setNumOutputsOverride(option.id)}
                        placeholderText="default"
                        className="w-full"
                    />
                </div>
            </div>
            <Dropdown
                options={playDropdownOptions.filter((p) => p.visible)}
                selectedOption={
                    selectedPlay
                        ? {id: selectedPlay.id, label: selectedPlay.name}
                        : null
                }
                setSelectedOption={(option) =>
                    setSelectedPlay(plays.find((p) => p.id === option.id))
                }
                placeholderText="Select a play..."
                className="w-full"
            />
            {selectedPlay && (
                <button
                    className="btn-primary w-fit h-fit"
                    disabled={!isPlayAbleToRunWithoutCustomVars(selectedPlay)}
                    onClick={() => {
                        const override = numOutputsOverride === "default" ? undefined : Number(numOutputsOverride);
                        runPlay(override);
                    }}
                >
                    Run Play
                </button>
            )}
        </div>
    );
}
