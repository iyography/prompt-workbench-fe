"use client";

import { StringDataTable } from "@/components/common/StringDataTable";
import { useBackendMutation, useBackendQuery } from "@/hooks/networking";
import { Profile, ProfileBD } from "@/models/profile";

export default function ProfilePage() {
  const { data: profile } = useBackendQuery<Profile>("profile/");

  const { mutate, error: errorUpdating } = useBackendMutation<
    Partial<ProfileBD>,
    Profile
  >("profile/", "PATCH");

  return (
    <div className="outer-container w-full">
      <div className="inner-container">
        <div className="flex flex-col gap-4">
          <h1>Setup Profile</h1>
          {errorUpdating && (
            <p className="error">
              ⛔️ There was an error saving your Profile data. Please reload the
              page and try again.
            </p>
          )}
          <StringDataTable
            isEditable
            data={profile?.variables || {}}
            onChange={(variables) => mutate({ variables })}
            label="Add your profile data which can be used across all plays:"
            valuesPerRow={3}
          />
        </div>
      </div>
    </div>
  );
}
