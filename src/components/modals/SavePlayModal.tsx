import { useBackendMutation } from "@/hooks/networking";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Optional } from "utility-types";
import { BaseModal } from "@/components/modals/BaseModal";
import { Play, PlayBD, PlayOutputType } from "@/models/play";

export function SavePlayModal({
  mode,
  play,
  open,
  onClose,
  onSave,
}: {
  mode: "create" | "update";
  play: Optional<PlayBD, "name" | "category"> & Optional<{ id: number }>;
  open: boolean;
  onClose: () => void;
  onSave: (play: Play) => void;
}) {
  const defaultName = () =>
    mode === "create" && play.name ? `${play.name} Copy` : play.name || "";
  const [name, setName] = useState<string>(defaultName());
  const [category, setCategory] = useState<string>(play.category || "");

  const submitData = {
    ...play,
    name,
    category: category ? category : null,
  };

  const queryClient = useQueryClient();
  const { mutate, isPending, error } = useBackendMutation<PlayBD, Play>(
    mode === "create" ? "plays/" : `plays/${play.id}/`,
    mode === "create" ? "POST" : "PUT",
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["plays/"] });
        if (play.output_type == PlayOutputType.VARIABLE) {
          queryClient.invalidateQueries({ queryKey: ["smart-variables/"] });
        }
        onSave(data);
      },
    },
  );
  const isReady = Boolean(name);
  const onSubmit = () => mutate(submitData);

  return (
    <BaseModal
      show={open}
      onClose={onClose}
      beforeEnter={() => {
        setName(defaultName());
        setCategory(play.category || "");
      }}
    >
      <div className="px-4 py-5 sm:p-6 w-full flex flex-col gap-2">
        <label htmlFor="name">Name your play</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          name="name"
          id="name"
          autoComplete="off"
          className="block w-full primary-input"
          placeholder="Mutual Connection Cold Outbound"
        />
        <label htmlFor="category">Category (optional):</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          type="text"
          name="category"
          id="category"
          autoComplete="off"
          className="block w-full primary-input"
          placeholder="LinkedIn"
        />
        <div className="flex mt-1 gap-2 items-center">
          <button
            disabled={!isReady || isPending}
            type="submit"
            className="btn-primary flex-grow-0 flex-shrink-0 w-fit"
            onClick={onSubmit}
          >
            Save
          </button>
          {isPending ? (
            <p>Saving...</p>
          ) : error ? (
            <p className="error">⛔️ {error.message}</p>
          ) : null}
        </div>
      </div>
    </BaseModal>
  );
}
